import { sendOrLogMessage } from "../helpers/responseHelper.js";
import { fromZonedTime } from "date-fns-tz";
import { TIMEZONE } from "../utils/dateUtils.js";

import express from "express";
import twilio from "twilio";
import { customAlphabet } from "nanoid";

import {
  interpretDriverMessage,
  transcribeAudioWithWhisper,
} from "../services/aiService.js";
import { generateProfitChart } from "../services/chartService.js";
import { sendReportImage } from "../services/twilioService.js";

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

import Expense from "../models/Expense.js";
import Income from "../models/Income.js";
import UserStats from "../models/UserStats.js";
import Reminder from "../models/Reminder.js";
import Vehicle from "../models/Vehicle.js";
const router = express.Router();
let conversationState = {};

router.post("/", async (req, res) => {
  const twiml = new twilio.twiml.MessagingResponse();
  const userId = req.body.From;

  try {
    let messageToProcess;

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

    const currentState = conversationState[userId];
    if (
      messageToProcess &&
      ["cancelar", "parar", "sair"].includes(
        messageToProcess.toLowerCase().trim()
      )
    ) {
      if (currentState) {
        delete conversationState[userId];
        twiml.message( "Ok, operação cancelada. 👍");
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

      if (req.body.MediaUrl0 && req.body.MediaContentType0.includes("audio")) {
        twiml.message(
          "✋ Para garantir a precisão dos dados, o cadastro do veículo deve ser feito *apenas por texto*.\n\nPor favor, digite sua resposta."
        );
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
          const currentYear = new Date().getFullYear();
          const inputYear = parseInt(vehicleFlowMessage);
          if (
            isNaN(parseInt(vehicleFlowMessage)) ||
            vehicleFlowMessage.length !== 4 ||
            inputYear > currentYear + 1
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
            const currentYear = new Date().getFullYear();
            const inputYear = parseInt(vehicleFlowMessage);
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
        default:
          twiml.message(
            "Hmm, não entendi sua resposta. Você está no meio do cadastro do veículo. Digite 'cancelar' para sair ou responda à última pergunta."
          );
          break;
      }
      res.writeHead(200, { "Content-Type": "text/xml" });
      return res.end(twiml.toString());
    }

    // fluxo com a IA começa aqui, só é executado se nenhum fluxo de conversa estiver ativo
    const userStats = await UserStats.findOne({ userId }, { blocked: 1 });
    if (userStats?.blocked) {
      twiml.message( "🚫 Você está bloqueado de usar a ADAP.");
      res.writeHead(200, { "Content-Type": "text/xml" });
      return res.end(twiml.toString());
    }

    const generateId = customAlphabet("1234567890abcdef", 5);

    const todayISO = new Date().toISOString();
    const interpretation = await interpretDriverMessage(
      messageToProcess,
      todayISO
    );
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

        // A quilometragem é obrigatória para registrar um ganho de corrida.
        if (
          category === "Corrida" &&
          (!distance || typeof distance !== "number" || distance <= 0)
        ) {
          twiml.message(
            "📈 Para registrar sua corrida, preciso saber a *quilometragem (km)*.\n\nPor favor, envie novamente com a distância. Exemplo:\n_Ganhei 30 na 99 em 10km_"
          );
          // Interrompe o fluxo aqui, não salva o registro.
          break;
        }

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
        const newExpense = new Expense({
          userId,
          amount,
          description,
          category,
          date: new Date(),
          messageId: generateId(),
        });

        await newExpense.save();
        devLog("Nova despesa salva:", newExpense);
        sendExpenseAddedMessage(twiml, newExpense);

        await UserStats.findOneAndUpdate(
          { userId },
          { $inc: { totalSpent: amount } },
          { upsert: true }
        );
        break;
      }
      case "delete_transaction": {
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
          `📈 Certo! Preparando seu gráfico de lucratividade dos últimos ${days} dias...`
        );

        try {
          devLog(`Buscando dados para o gráfico dos últimos ${days} dias...`);
          const reportData = await getProfitReportData(userId, days);

          if (reportData.length === 0) {
            twiml.message(
              `📉 Não encontrei nenhuma transação nos últimos ${days} dias para gerar o gráfico.`
            );
            break;
          }

          devLog("Gerando a imagem do gráfico...");
          const imageUrl = await generateProfitChart(reportData, userId);
          devLog(`Enviando imagem do gráfico: ${imageUrl}`);
          await sendReportImage(userId, imageUrl);
        } catch (error) {
          devLog("❌ Erro ao gerar o gráfico de lucratividade:", error);
          twiml.message(
            "❌ Desculpe, ocorreu um erro ao tentar gerar seu gráfico. Tente novamente mais tarde."
          );
        }

        break;
      }
      case "get_summary": {
        let { month, monthName } = interpretation.data;

        if (!month) {
          const now = new Date();
          month = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(
            2,
            "0"
          )}`;
          const monthNameRaw = now.toLocaleString("pt-BR", { month: "long" });
          monthName =
            monthNameRaw.charAt(0).toUpperCase() + monthNameRaw.slice(1);
        }

        devLog(`Calculando resumo de LUCRO para: Mês=${month}`);
        const summaryMessage = await getPeriodSummary(userId, month, monthName);

        twiml.message( summaryMessage);
        break;
      }
      case "get_expenses_by_category": {
        let { month, monthName, category } = interpretation.data;

        if (!month) {
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
          `Buscando gastos por categoria: Mês=${month}, Categoria=${
            category || "Todas"
          }`
        );
        const expenses = await getExpensesByCategory(userId, month, category);
        if (expenses.length === 0) {
          twiml.message(
            `Você não tem nenhum gasto registrado em *${monthName}* ${
              category ? `na categoria *${category}*` : ""
            }.`
          );
          break;
        }

        let message = `*Gastos de ${monthName}${
          category ? ` em ${category}` : ""
        }* 💸\n\n`;
        let totalSpent = 0;

        expenses.forEach((exp) => {
          const groupName = category ? exp.description : exp._id;
          message += `*${groupName}*: R$ ${exp.total.toFixed(2)}\n`;
          totalSpent += exp.total;
        });

        message += `\n*Total Gasto:* R$ ${totalSpent.toFixed(2)}`;
        message += `\n\n_Digite "detalhes gastos" para ver a lista completa._`;
        conversationState[userId] = {
          type: "expense",
          month,
          monthName,
          category,
        };
        twiml.message( message);
        break;
      }
      case "get_incomes_by_source": {
        let { month, monthName, source } = interpretation.data;

        if (!month) {
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
          `Buscando ganhos por plataforma: Mês=${month}, Fonte=${
            source || "Todas"
          }`
        );
        // A função agora retorna os dados com contagem e distância!
        const incomes = await getIncomesBySource(userId, month, source);

        if (incomes.length === 0) {
          twiml.message(
            `Você não tem nenhuma corrida registrada em *${monthName}* ${
              source ? `da plataforma *${source}*` : ""
            }.`
          );
          break;
        }

        let message = `*Ganhos de ${monthName}${
          source ? ` da ${source}` : ""
        }* 💰\n`;
        let totalIncome = 0;

        incomes.forEach((inc) => {
          totalIncome += inc.total;
          const averageRperKm = inc.total / inc.totalDistance;

          // Monta a linha de detalhes para cada plataforma
          const detailsLine = `_${inc.count} corridas | ${inc.totalDistance.toFixed(1)} km | R$ ${averageRperKm.toFixed(2)} por km_`;

          message += `\n*${inc._id}: R$ ${inc.total.toFixed(2)}*\n${detailsLine}\n`;
        });

        message += `\n*Total Recebido:* R$ ${totalIncome.toFixed(2)}`;
        message += `\n\n_Digite "detalhes receitas" para ver a lista completa._`;

        conversationState[userId] = {
          type: "income",
          month,
          monthName,
          source,
        };
        twiml.message(message);
        break;
      }
      case "get_transaction_details": {
        let { type } = interpretation.data;
        const previousData = conversationState[userId];

        if (!previousData || !previousData.month) {
          twiml.message(
            "Não há um relatório recente para detalhar. Peça um resumo de gastos ou ganhos primeiro."
          );
          break;
        }

        if (!type) {
          type = previousData.type;
        }

        if (!type) {
          twiml.message(
            'Por favor, especifique o que deseja detalhar. Ex: "detalhes gastos" ou "detalhes receitas".'
          );
          break;
        }

        const { month, monthName, category, source } = previousData;
        devLog(`Buscando detalhes para: Tipo=${type}, Mês=${month}`);

        const detailsMessage =
          type === "income"
            ? await getIncomeDetails(userId, month, monthName, source)
            : await getExpenseDetails(userId, month, monthName, category);

        twiml.message( detailsMessage);
        delete conversationState[userId];
        break;
      }
      case "greeting": {
        sendGreetingMessage(twiml);
        break;
      }
      case "add_reminder": {
        const { description, date, type, relativeMinutes } =
          interpretation.data;

        if (!date && !relativeMinutes) {
          twiml.message(
            "⏰ Por favor, forneça uma data e hora futuras válidas..."
          );
          break;
        }

        let dateToSave;
        if (relativeMinutes) {
          const now = new Date();
          now.setMinutes(now.getMinutes() + relativeMinutes);
          dateToSave = now;
          devLog(
            `[add_reminder] Data calculada a partir de tempo relativo: ${dateToSave.toISOString()}`
          );
        } else {
          const localDateString = date.slice(0, 19);
          dateToSave = fromZonedTime(localDateString, TIMEZONE);
          devLog(
            `[add_reminder] Data absoluta convertida para UTC: ${dateToSave.toISOString()}`
          );
        }

        if (dateToSave.getTime() <= Date.now()) {
          twiml.message(
            "⏰ Ops, esse horário já passou! Por favor, forneça uma data e hora futuras."
          );
          break;
        }

        const newReminder = new Reminder({
          userId,
          description,
          date: dateToSave,
          type: type || "Outro",
          messageId: generateId(),
        });

        await newReminder.save();
        await sendReminderMessage(twiml, newReminder);
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
