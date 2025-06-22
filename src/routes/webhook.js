// src/routes/webhook.js

// --- Frameworks e Libs Essenciais ---
import express from "express";
import twilio from "twilio";
import { customAlphabet } from "nanoid";

// --- Nossos Módulos de Serviço (A "Inteligência") ---
import {
  interpretDriverMessage,
  transcribeAudioWithWhisper,
} from "../services/aiService.js";
import { generateProfitChart } from "../services/chartService.js";
import { sendReportImage } from "../services/twilioService.js"; // Para enviar o gráfico

// --- Nossos Módulos de Ajuda (Os "Assistentes") ---
import { devLog } from "../helpers/logger.js";
import {
  getPeriodSummary,
  getProfitReportData,
  getTotalReminders,
  getExpenseDetails,
  getIncomeDetails,
  getExpensesByCategory,
  getIncomesBySource,
} from "../helpers/totalUtils.js";
import {
  sendGreetingMessage,
  sendHelpMessage,
  sendIncomeAddedMessage,
  sendExpenseAddedMessage,
  sendIncomeDeletedMessage,
  sendExpenseDeletedMessage,
  sendReminderMessage,
  sendTotalRemindersMessage,
  sendReminderDeletedMessage,
} from "../helpers/messages.js";

// --- Nossos Modelos de Banco de Dados (A "Memória") ---
import Expense from "../models/Expense.js";
import Income from "../models/Income.js";
import UserStats from "../models/UserStats.js"; // O que causou o erro anterior!
import Reminder from "../models/Reminder.js";
import Vehicle from "../models/Vehicle.js";
const router = express.Router();
let conversationState = {};

router.post("/", async (req, res) => {
  const twiml = new twilio.twiml.MessagingResponse();
  const userId = req.body.From;

  try {
    let messageToProcess;

    // identificar se a mensagem é um áudio ou texto
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

    // roteamento de conversas começa aqui
    const currentState = conversationState[userId];
    if (
      messageToProcess &&
      ["cancelar", "parar", "sair"].includes(
        messageToProcess.toLowerCase().trim()
      )
    ) {
      if (currentState) {
        delete conversationState[userId]; // Limpa o estado da conversa
        twiml.message("Ok, operação cancelada. 👍");
        devLog(`Fluxo cancelado pelo usuário: ${userId}`);
      } else {
        twiml.message(
          "Não há nenhuma operação em andamento para cancelar. Como posso ajudar?"
        );
      }
      res.writeHead(200, { "Content-Type": "text/xml" });
      return res.end(twiml.toString());
    }

    if (currentState && currentState.flow === "vehicle_registration") {
      devLog(`Fluxo de Cadastro de Veículo - Passo: ${currentState.step}`);

      // bloqueando áudio no cadastro de carros
      if (req.body.MediaUrl0 && req.body.MediaContentType0.includes("audio")) {
        twiml.message(
          "✋ Para garantir a precisão dos dados, o cadastro do veículo deve ser feito *apenas por texto*.\n\nPor favor, digite sua resposta."
        );
        // A mensagem de áudio é ignorada e o estado da conversa não muda.
        res.writeHead(200, { "Content-Type": "text/xml" });
        return res.end(twiml.toString());
      }

      const vehicleFlowMessage = messageToProcess.trim();
      const isConfirmation = ["sim", "s"].includes(
        vehicleFlowMessage.toLowerCase()
      );

      switch (currentState.step) {
        case "awaiting_brand":
          currentState.tempData = vehicleFlowMessage;
          currentState.step = "confirming_brand";
          twiml.message(
            `Você digitou: "*${vehicleFlowMessage}*"\n\nEstá correto? Responda "*sim*" para confirmar, ou envie a marca novamente.`
          );
          break;

        case "confirming_brand":
          if (isConfirmation) {
            currentState.brand = currentState.tempData;
            delete currentState.tempData;
            currentState.step = "awaiting_model";
            twiml.message(
              "✅ Marca confirmada!\n\nAgora, qual o *modelo* do seu carro? (Ex: Onix, Argo, HB20 Comfort Plus)"
            );
          } else {
            currentState.tempData = vehicleFlowMessage;
            twiml.message(
              `Ok, entendi: "*${vehicleFlowMessage}*"\n\nCorreto? (Responda "*sim*" ou envie novamente)`
            );
          }
          break;

        case "awaiting_model":
          currentState.tempData = vehicleFlowMessage;
          currentState.step = "confirming_model";
          twiml.message(
            `Modelo: "*${vehicleFlowMessage}*"\n\nEstá correto? (Responda "*sim*" ou envie novamente)`
          );
          break;

        case "confirming_model":
          if (isConfirmation) {
            currentState.model = currentState.tempData;
            delete currentState.tempData;
            currentState.step = "awaiting_year";
            twiml.message(
              "✅ Modelo confirmado!\n\nQual o *ano* do seu carro? (Ex: 2022)"
            );
          } else {
            currentState.tempData = vehicleFlowMessage;
            twiml.message(
              `Ok, entendi: "*${vehicleFlowMessage}*"\n\nCorreto? (Responda "*sim*" ou envie novamente)`
            );
          }
          break;

        case "awaiting_year":
          if (
            isNaN(parseInt(vehicleFlowMessage)) ||
            vehicleFlowMessage.length !== 4
          ) {
            twiml.message(
              "Opa, o ano parece inválido. Por favor, envie apenas o ano com 4 dígitos (ex: 2021)."
            );
          } else {
            currentState.tempData = vehicleFlowMessage;
            currentState.step = "confirming_year";
            twiml.message(
              `Ano: *${vehicleFlowMessage}*\n\nEstá correto? (Responda "*sim*" ou envie novamente)`
            );
          }
          break;

        case "confirming_year":
          if (isConfirmation) {
            currentState.year = parseInt(currentState.tempData);
            delete currentState.tempData;
            currentState.step = "awaiting_mileage";
            twiml.message(
              "✅ Ano confirmado!\n\nPara finalizar, qual a *quilometragem (KM)* atual do painel?"
            );
          } else {
            if (
              isNaN(parseInt(vehicleFlowMessage)) ||
              vehicleFlowMessage.length !== 4
            ) {
              twiml.message(
                "Este ano também parece inválido. Por favor, envie o ano com 4 dígitos (ex: 2021)."
              );
            } else {
              currentState.tempData = vehicleFlowMessage;
              twiml.message(
                `Ok, entendi: *${vehicleFlowMessage}*\n\nCorreto? (Responda "*sim*" ou envie novamente)`
              );
            }
          }
          break;

        case "awaiting_mileage":
          const mileage = vehicleFlowMessage.replace(/\D/g, "");
          if (isNaN(parseInt(mileage))) {
            twiml.message(
              "Não entendi a quilometragem. Por favor, envie apenas os números (ex: 85000)."
            );
          } else {
            currentState.tempData = parseInt(mileage);
            currentState.step = "confirming_mileage";
            twiml.message(
              `Quilometragem: *${mileage} KM*\n\nEstá correto? (Responda "*sim*" para finalizar o cadastro)`
            );
          }
          break;

        case "confirming_mileage":
          if (isConfirmation) {
            currentState.mileage = currentState.tempData;
            const newVehicle = new Vehicle({
              userId,
              brand: currentState.brand,
              model: currentState.model,
              year: currentState.year,
              initialMileage: currentState.mileage,
              currentMileage: currentState.mileage,
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
          } else {
            const newMileage = vehicleFlowMessage.replace(/\D/g, "");
            if (isNaN(parseInt(newMileage))) {
              twiml.message(
                "Este valor também parece inválido. Por favor, envie apenas os números (ex: 85000)."
              );
            } else {
              currentState.tempData = parseInt(newMileage);
              twiml.message(
                `Ok, entendi: *${newMileage} KM*\n\nCorreto? (Responda "*sim*" para finalizar)`
              );
            }
          }
          break;
      }
      res.writeHead(200, { "Content-Type": "text/xml" });
      return res.end(twiml.toString());
    }
    //roteamento de conversas termina aqui

    // fluxo com a IA começa aqui, só é executado se nenhum fluxo de conversa estiver ativo
    const userStats = await UserStats.findOne({ userId }, { blocked: 1 });
    if (userStats?.blocked) {
      twiml.message("🚫 Você está bloqueado de usar a ADAP.");
      res.writeHead(200, { "Content-Type": "text/xml" });
      return res.end(twiml.toString());
    }

    const generateId = customAlphabet("1234567890abcdef", 5);

    // interpretação da mensagem pela IA
    const interpretation = await interpretDriverMessage(messageToProcess);
    devLog("Intenção da IA:", interpretation.intent);

    switch (interpretation.intent) {
      case "register_vehicle": {
        conversationState[userId] = {
          flow: "vehicle_registration",
          step: "awaiting_brand",
        };
        twiml.message(
          "🚗 Vamos cadastrar seu carro!\n\nResponda a sequência de perguntas e pare a qualquer momento digitando 'cancelar'.\n\nQual a *marca* do seu veículo? (Ex: Chevrolet, Fiat, Hyundai)"
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
        break;
      }

      case "get_expenses_by_category": {
        const now = new Date();
        const month = `${now.getFullYear()}-${String(
          now.getMonth() + 1
        ).padStart(2, "0")}`;
        const monthNameRaw = now.toLocaleString("pt-BR", { month: "long" });
        const monthName =
          monthNameRaw.charAt(0).toUpperCase() + monthNameRaw.slice(1);

        const expenses = await getExpensesByCategory(userId, month);

        if (expenses.length === 0) {
          twiml.message(
            `Você não tem nenhum gasto registrado em *${monthName}*.`
          );
          break;
        }

        let message = `*Gastos de ${monthName} por Categoria* 💸\n\n`;
        let totalSpent = 0;
        expenses.forEach((exp) => {
          message += `*${exp._id}*: R$ ${exp.total.toFixed(2)}\n`;
          totalSpent += exp.total;
        });

        message += `\n*Total Gasto:* R$ ${totalSpent.toFixed(2)}`;
        message += `\n\n_Digite "detalhes gastos" para ver a lista completa._`;

        // Salva o contexto para o comando "detalhes"
        conversationState[userId] = {
          type: "expense",
          month: month,
          monthName: monthName,
        };

        twiml.message(message);
        break;
      }

      case "get_incomes_by_source": {
        const now = new Date();
        const month = `${now.getFullYear()}-${String(
          now.getMonth() + 1
        ).padStart(2, "0")}`;
        const monthNameRaw = now.toLocaleString("pt-BR", { month: "long" });
        const monthName =
          monthNameRaw.charAt(0).toUpperCase() + monthNameRaw.slice(1);

        const incomes = await getIncomesBySource(userId, month);

        if (incomes.length === 0) {
          twiml.message(
            `Você não tem nenhuma receita registrada em *${monthName}*.`
          );
          break;
        }

        let message = `*Ganhos de ${monthName} por Plataforma* 💰\n\n`;
        let totalIncome = 0;
        incomes.forEach((inc) => {
          message += `*${inc._id}*: R$ ${inc.total.toFixed(2)}\n`;
          totalIncome += inc.total;
        });

        message += `\n*Total Recebido:* R$ ${totalIncome.toFixed(2)}`;
        message += `\n\n_Digite "detalhes receitas" para ver a lista completa._`;

        // Salva o contexto para o comando "detalhes"
        conversationState[userId] = {
          type: "income",
          month: month,
          monthName: monthName,
        };

        twiml.message(message);
        break;
      }

      case "detalhes": {
        const messageText = messageToProcess.toLowerCase();
        let detailType;
        if (messageText.includes("gasto")) {
          detailType = "expense";
        } else if (messageText.includes("receita")) {
          detailType = "income";
        } else {
          twiml.message(
            'Por favor, especifique o que deseja detalhar. Ex: "detalhes gastos" ou "detalhes receitas".'
          );
          break;
        }

        const previousData = conversationState[userId];

        if (!previousData || !previousData.month) {
          twiml.message(
            "Não há um relatório recente para detalhar. Peça um resumo de gastos ou receitas primeiro."
          );
          break;
        }

        const { month, monthName } = previousData;

        const detailsMessage =
          detailType === "income"
            ? await getIncomeDetails(userId, month, monthName)
            : await getExpenseDetails(userId, month, monthName);

        twiml.message(detailsMessage);
        // Limpa o estado após o uso bem-sucedido
        delete conversationState[userId];
        break;
      }

      case "get_summary": {
        let { category, source, month, monthName } = interpretation.data;

        if (!month || !monthName) {
          const now = new Date();
          month = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(
            2,
            "0"
          )}`;
          const monthNameRaw = now.toLocaleString("pt-BR", { month: "long" });
          monthName =
            monthNameRaw.charAt(0).toUpperCase() + monthNameRaw.slice(1);
        }

        devLog(
          `Calculando resumo para: Mês=${month}, Categoria=${category}, Fonte=${source}`
        );

        const summaryMessage = await getPeriodSummary(
          userId,
          month,
          monthName,
          source,
          category
        );

        twiml.message(summaryMessage);
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

  res.writeHead(200, { "Content-Type": "text/xml" });
  res.end(twiml.toString());
});

export default router;
