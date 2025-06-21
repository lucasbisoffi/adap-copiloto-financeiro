import express from "express";
import twilio from "twilio";
import { devLog } from "../helpers/logger.js";
import {
  interpretDriverMessage,
  transcribeAudioWithWhisper,
} from "../services/aiService.js";
import // Funções existentes...
"../helpers/totalUtils.js";
import { generateProfitChart } from "../services/chartService.js";
// ... outros imports

const router = express.Router();
let conversationState = {};

router.post("/", async (req, res) => {
  const twiml = new twilio.twiml.MessagingResponse();
  const userId = req.body.From;

  try {
    let messageToProcess;

    // --- ETAPA 1: DETERMINAR A MENSAGEM A SER PROCESSADA (Áudio ou Texto) ---
    if (req.body.MediaUrl0 && req.body.MediaContentType0.includes("audio")) {
      const audioUrl = req.body.MediaUrl0;
      devLog(`Áudio detectado. URL: ${audioUrl}`);
      messageToProcess = await transcribeAudioWithWhisper(audioUrl);
      devLog(`Texto transcrito: "${messageToProcess}"`);
    } else {
      messageToProcess = req.body.Body;
    }

    if (!messageToProcess || messageToProcess.trim() === "") {
      devLog("Mensagem vazia, nenhuma ação a ser tomada.");
      res.writeHead(200, { "Content-Type": "text/xml" });
      return res.end(twiml.toString());
    }

    devLog(`Mensagem de ${userId} para processar: "${messageToProcess}"`);

    // --- ETAPA 2: VERIFICAR FLUXOS DE CONVERSA ATIVOS ---
    const currentState = conversationState[userId];
    if (currentState && currentState.flow === "vehicle_registration") {
      // O fluxo de conversa do veículo continua aqui, usando 'messageToProcess'
      const vehicleFlowMessage = messageToProcess;
      switch (currentState.step) {
        case "awaiting_brand":
          currentState.brand = vehicleFlowMessage;
          currentState.step = "awaiting_model";
          twiml.message("Legal! E qual o *modelo*? (Ex: Onix, Argo, HB20)");
          break;
        case "awaiting_model":
          currentState.model = vehicleFlowMessage;
          currentState.step = "awaiting_year";
          twiml.message("Anotado. Qual o *ano* do seu carro?");
          break;
        case "awaiting_year":
          if (
            isNaN(parseInt(vehicleFlowMessage)) ||
            vehicleFlowMessage.length !== 4
          ) {
            twiml.message(
              "Hmm, o ano parece inválido. Por favor, envie apenas o ano com 4 dígitos (ex: 2021)."
            );
          } else {
            currentState.year = parseInt(vehicleFlowMessage);
            currentState.step = "awaiting_mileage";
            twiml.message(
              "Perfeito. Para finalizar, qual a *quilometragem (KM)* atual do painel?"
            );
          }
          break;
        case "awaiting_mileage":
          const mileage = parseInt(vehicleFlowMessage.replace(/\D/g, ""));
          if (isNaN(mileage)) {
            twiml.message(
              "Não entendi a quilometragem. Por favor, envie apenas os números (ex: 85000)."
            );
          } else {
            currentState.initialMileage = mileage;
            const newVehicle = new Vehicle({
              userId,
              brand: currentState.brand,
              model: currentState.model,
              year: currentState.year,
              initialMileage: mileage,
              currentMileage: mileage,
            });
            await newVehicle.save();
            await UserStats.findOneAndUpdate(
              { userId },
              { $set: { activeVehicleId: newVehicle._id } },
              { upsert: true }
            );
            twiml.message(
              `🚀 Prontinho! Seu *${currentState.brand} ${currentState.model}* foi cadastrado com sucesso.`
            );
            delete conversationState[userId];
          }
          break;
      }
      // Se estamos em um fluxo de conversa, respondemos e terminamos a execução aqui.
      res.writeHead(200, { "Content-Type": "text/xml" });
      return res.end(twiml.toString());
    }

    // --- ETAPA 3: FLUXO PRINCIPAL COM INTERPRETAÇÃO DA IA ---
    // Esta parte só é executada se não estivermos em um fluxo de conversa.
    const userStats = await UserStats.findOne({ userId }, { blocked: 1 });
    if (userStats?.blocked) {
      twiml.message("🚫 Você está bloqueado de usar a ADAP.");
      res.writeHead(200, { "Content-Type": "text/xml" });
      return res.end(twiml.toString());
    }

    const generateId = customAlphabet("1234567890abcdef", 5);

    // CORREÇÃO: Usar 'messageToProcess' para a interpretação da IA
    const interpretation = await interpretDriverMessage(messageToProcess);
    devLog("Intenção da IA:", interpretation.intent);

    switch (interpretation.intent) {
      case "register_vehicle": {
        conversationState[userId] = {
          flow: "vehicle_registration",
          step: "awaiting_brand",
        };
        twiml.message(
          "Vamos cadastrar seu carro! 🚗\n\nPrimeiro, qual a *marca* do seu veículo? (Ex: Chevrolet, Fiat, Hyundai)"
        );
        break;
      }

      case "add_income": {
        const { amount, description, category, source, tax, distance } =
          interpretation.data;
        const newIncome = new Income({
          userId,
          amount,
          description,
          category,
          source,
          tax,
          distance,
          date: new Date(),
          messageId: generateId(),
        });
        await newIncome.save();
        sendIncomeAddedMessage(twiml, newIncome);
        await UserStats.findOneAndUpdate(
          { userId },
          { $inc: { totalIncome: amount } },
          { upsert: true }
        );
        break;
      }
      case "add_expense": {
        const { amount, description, category } = interpretation.data;

        // MUDANÇA: Lógica de categoria personalizada e verificação foi totalmente removida.
        // A IA já nos fornece uma categoria válida do nosso 'enum'.
        const newExpense = new Expense({
          userId,
          amount,
          description,
          category, // Vem direto da IA
          date: new Date(),
          messageId: generateId(),
        });

        await newExpense.save();
        devLog("Nova despesa salva:", newExpense);

        // TODO: A mensagem de confirmação precisa ser atualizada.
        sendExpenseAddedMessage(twiml, newExpense);

        await UserStats.findOneAndUpdate(
          { userId },
          { $inc: { totalSpent: amount } },
          { upsert: true }
        );
        break;
      }

      case "delete_transaction": {
        // MUDANÇA: A lógica base é a mesma, mas a remoção da 'createdCategory' simplifica.
        const { messageId } = interpretation.data;
        const income = await Income.findOneAndDelete({ userId, messageId });

        if (income) {
          await UserStats.findOneAndUpdate(
            { userId },
            { $inc: { totalIncome: -income.amount } }
          );
          sendIncomeDeletedMessage(twiml, income);
        } else {
          const expense = await Expense.findOneAndDelete({ userId, messageId });
          if (expense) {
            await UserStats.findOneAndUpdate(
              { userId },
              { $inc: { totalSpent: -expense.amount } }
            );
            sendExpenseDeletedMessage(twiml, expense);
          } else {
            twiml.message(
              `🚫 Nenhum registro encontrado com o ID _#${messageId}_ para exclusão.`
            );
          }
        }
        break;
      }

      case "generate_profit_chart": {
        const { days = 7 } = interpretation.data;
        twiml.message(
          `📈 Certo! Gerando o gráfico de lucratividade dos últimos ${days} dias... (Funcionalidade em desenvolvimento)`
        );
        // TODO: Implementar a lógica real
        // 1. Chamar uma nova função em `totalUtils.js` que busca ganhos E gastos.
        // 2. Chamar uma nova função em `chartService.js` que cria um gráfico de barras (Ganhos vs Gastos).
        // 3. Enviar a imagem com `sendReportImage`.
        break;
      }

      case "get_summary": {
        const { category, source, month } = interpretation.data;
        twiml.message(
          `📊 Ok! Calculando o resumo para você... (Funcionalidade em desenvolvimento)`
        );
        // TODO: Implementar a lógica real
        // 1. Criar uma nova função em `totalUtils.js` para calcular resumos.
        //    - Se `source` for informado, calcula ganhos daquela plataforma.
        //    - Se `category` for informada, calcula gastos daquela categoria.
        //    - Se nada for informado, calcula Lucro = Ganhos - Gastos do período.
        // 2. Montar uma mensagem clara com o resultado.
        break;
      }

      case "detalhes": {
        const previousData = conversationState[userId];
        if (!previousData || !previousData.month) {
          twiml.message(
            "🚫 Para ver os detalhes, peça um resumo de gastos ou receitas primeiro."
          );
          break;
        }
        const { type, category, month, monthName } = previousData;
        const detailsMessage =
          type === "income"
            ? await getIncomeDetails(userId, month, monthName, category)
            : await getExpenseDetails(userId, month, monthName, category);

        twiml.message(detailsMessage);
        delete conversationState[userId];
        break;
      }

      case "greeting": {
        // MUDANÇA: A mensagem de saudação precisa ser adaptada para motoristas.
        sendGreetingMessage(twiml);
        break;
      }

      case "add_reminder": {
        const { description, reminderDate, type } = interpretation.data;
        const newReminder = new Reminder({
          userId,
          description,
          reminderDate,
          type,
          messageId: generateId(),
        });
        await newReminder.save();
        devLog("Novo lembrete salvo:", newReminder);
        // Passando o texto original (transcrito ou não) para a mensagem de confirmação
        await sendReminderMessage(twiml, messageToProcess, newReminder);
        break;
      }

      case "delete_reminder": {
        const { messageId } = interpretation.data;
        const reminder = await Reminder.findOneAndDelete({ userId, messageId });
        if (reminder) {
          sendReminderDeletedMessage(twiml, reminder);
        } else {
          twiml.message(
            `🚫 Nenhum lembrete com o ID _#${messageId}_ foi encontrado.`
          );
        }
        break;
      }

      case "list_reminders": {
        const totalReminders = await getTotalReminders(userId);
        sendTotalRemindersMessage(twiml, totalReminders);
        break;
      }

      case "instructions": {
        // TODO: A mensagem de ajuda precisa ser totalmente reescrita para o público motorista.
        sendHelpMessage(twiml);
        break;
      }

      default:
        sendHelpMessage(twiml);
        break;
    }
  } catch (err) {
    devLog("ERRO CRÍTICO no webhook:", err);
    twiml.message(
      "Ops! 🤖 Tive um curto-circuito aqui. Se foi um áudio, tente gravar em um lugar mais silencioso."
    );
  }

  // --- ETAPA FINAL: Enviar a resposta ---
  res.writeHead(200, { "Content-Type": "text/xml" });
  res.end(twiml.toString());
});

export default router;
