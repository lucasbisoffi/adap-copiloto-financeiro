import { sendOrLogMessage } from "../helpers/responseHelper.js";

import express from "express";
import twilio from "twilio";
import { customAlphabet } from "nanoid";

import {
  interpretDriverMessage,
  transcribeAudioWithWhisper,
} from "../services/aiService.js";
import { generateProfitChart } from "../services/chartService.js";
import { sendReportImage } from "../services/twilioService.js"; //

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
        twiml.message("Ok, operação cancelada. 👍");
        devLog(`Fluxo cancelado pelo usuário: ${userId}`);
      } else {
        sendOrLogMessage(
          twiml,
          "Não há nenhuma operação em andamento para cancelar. Como posso ajudar?"
        );
      }
      res.writeHead(200, { "Content-Type": "text/xml" });
      return res.end(twiml.toString());
    }

    if (currentState && currentState.flow === "vehicle_registration") {
      devLog(`Fluxo de Cadastro de Veículo - Passo: ${currentState.step}`);

      if (req.body.MediaUrl0 && req.body.MediaContentType0.includes("audio")) {
        sendOrLogMessage(
          twiml,
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
          sendOrLogMessage(
            twiml,
            `Você digitou: "*${vehicleFlowMessage}*"\n\nEstá correto? Responda "*sim*" para confirmar, ou envie a marca novamente.`
          );
          break;

        case "confirming_brand":
          if (isConfirmation) {
            currentState.brand = currentState.tempData;
            delete currentState.tempData;
            currentState.step = "awaiting_model";
            sendOrLogMessage(
              twiml,
              "✅ Marca confirmada!\n\nAgora, qual o *modelo* do seu carro? (Ex: Onix, Argo, HB20 Comfort Plus)"
            );
          } else {
            currentState.tempData = vehicleFlowMessage;
            sendOrLogMessage(
              twiml,
              `Ok, entendi: "*${vehicleFlowMessage}*"\n\nCorreto? (Responda "*sim*" ou envie novamente)`
            );
          }
          break;

        case "awaiting_model":
          currentState.tempData = vehicleFlowMessage;
          currentState.step = "confirming_model";
          sendOrLogMessage(
            twiml,
            `Modelo: "*${vehicleFlowMessage}*"\n\nEstá correto? (Responda "*sim*" ou envie novamente)`
          );
          break;

        case "confirming_model":
          if (isConfirmation) {
            currentState.model = currentState.tempData;
            delete currentState.tempData;
            currentState.step = "awaiting_year";
            sendOrLogMessage(
              twiml,
              "✅ Modelo confirmado!\n\nQual o *ano* do seu carro? (Ex: 2022)"
            );
          } else {
            currentState.tempData = vehicleFlowMessage;
            sendOrLogMessage(
              twiml,
              `Ok, entendi: "*${vehicleFlowMessage}*"\n\nCorreto? (Responda "*sim*" ou envie novamente)`
            );
          }
          break;

        case "awaiting_year":
          if (
            isNaN(parseInt(vehicleFlowMessage)) ||
            vehicleFlowMessage.length !== 4
          ) {
            sendOrLogMessage(
              twiml,
              "Opa, o ano parece inválido. Por favor, envie apenas o ano com 4 dígitos (ex: 2021)."
            );
          } else {
            currentState.tempData = vehicleFlowMessage;
            currentState.step = "confirming_year";
            sendOrLogMessage(
              twiml,
              `Ano: *${vehicleFlowMessage}*\n\nEstá correto? (Responda "*sim*" ou envie novamente)`
            );
          }
          break;

        case "confirming_year":
          if (isConfirmation) {
            currentState.year = parseInt(currentState.tempData);
            delete currentState.tempData;
            currentState.step = "awaiting_mileage";
            sendOrLogMessage(
              twiml,
              "✅ Ano confirmado!\n\nPara finalizar, qual a *quilometragem (KM)* atual do painel?"
            );
          } else {
            if (
              isNaN(parseInt(vehicleFlowMessage)) ||
              vehicleFlowMessage.length !== 4
            ) {
              sendOrLogMessage(
                twiml,
                "Este ano também parece inválido. Por favor, envie o ano com 4 dígitos (ex: 2021)."
              );
            } else {
              currentState.tempData = vehicleFlowMessage;
              sendOrLogMessage(
                twiml,
                `Ok, entendi: *${vehicleFlowMessage}*\n\nCorreto? (Responda "*sim*" ou envie novamente)`
              );
            }
          }
          break;

        case "awaiting_mileage":
          const mileage = vehicleFlowMessage.replace(/\D/g, "");
          if (isNaN(parseInt(mileage))) {
            sendOrLogMessage(
              twiml,
              "Não entendi a quilometragem. Por favor, envie apenas os números (ex: 85000)."
            );
          } else {
            currentState.tempData = parseInt(mileage);
            currentState.step = "confirming_mileage";
            sendOrLogMessage(
              twiml,
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

            sendOrLogMessage(
              twiml,
              `🚀 Prontinho! Seu *${currentState.brand} ${currentState.model}* foi cadastrado com sucesso.`
            );
            delete conversationState[userId];
          } else {
            const newMileage = vehicleFlowMessage.replace(/\D/g, "");
            if (isNaN(parseInt(newMileage))) {
              sendOrLogMessage(
                twiml,
                "Este valor também parece inválido. Por favor, envie apenas os números (ex: 85000)."
              );
            } else {
              currentState.tempData = parseInt(newMileage);
              sendOrLogMessage(
                twiml,
                `Ok, entendi: *${newMileage} KM*\n\nCorreto? (Responda "*sim*" para finalizar)`
              );
            }
          }
          break;
      }
      res.writeHead(200, { "Content-Type": "text/xml" });
      return res.end(twiml.toString());
    }

    // fluxo com a IA começa aqui, só é executado se nenhum fluxo de conversa estiver ativo
    const userStats = await UserStats.findOne({ userId }, { blocked: 1 });
    if (userStats?.blocked) {
      twiml.message("🚫 Você está bloqueado de usar a ADAP.");
      res.writeHead(200, { "Content-Type": "text/xml" });
      return res.end(twiml.toString());
    }

    const generateId = customAlphabet("1234567890abcdef", 5);

    const todayISO = new Date().toISOString(); 
    const interpretation = await interpretDriverMessage(messageToProcess, todayISO);
    devLog("Intenção da IA:", interpretation.intent);

    switch (interpretation.intent) {
      case "register_vehicle": {
        conversationState[userId] = {
          flow: "vehicle_registration",
          step: "awaiting_brand",
        };
        sendOrLogMessage(
          twiml,
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
            sendOrLogMessage(
              twiml,
              `🚫 Nenhum registro encontrado com o ID _#${messageId}_ para exclusão.`
            );
          }
        }
        break;
      }
      case "generate_profit_chart": {
        const { days = 7 } = interpretation.data;
        sendOrLogMessage(
          twiml,
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
          sendOrLogMessage(
            twiml,
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
          sendOrLogMessage(
            twiml,
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

        conversationState[userId] = {
          type: "income",
          month: month,
          monthName: monthName,
        };

        twiml.message(message);
        break;
      }
      case "get_transaction_details": {
        let { type } = interpretation.data;
        const previousData = conversationState[userId];

        if (!previousData || !previousData.month) {
          sendOrLogMessage(
            twiml,
            "Não há um relatório recente para detalhar. Peça um resumo de gastos ou receitas primeiro."
          );
          break;
        }

        if (!type) {
          type = previousData.type;
        }

        if (!type) {
          sendOrLogMessage(
            twiml,
            'Por favor, especifique o que deseja detalhar. Ex: "detalhes gastos" ou "detalhes receitas".'
          );
          break;
        }
        const { month, monthName } = previousData;
        devLog(`Buscando detalhes para: Tipo=${type}, Mês=${month}`);
        const detailsMessage =
          type === "income"
            ? await getIncomeDetails(userId, month, monthName)
            : await getExpenseDetails(userId, month, monthName);

        twiml.message(detailsMessage);
        delete conversationState[userId];
        break;
      }
      case "get_summary": {
        let { month, monthName } = interpretation.data;
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

        devLog(`Calculando resumo de LUCRO para: Mês=${month}`);
        const summaryMessage = await getPeriodSummary(
          userId,
          month,
          monthName,
          null,
          null 
        );

        twiml.message(summaryMessage);
        conversationState[userId] = {
          type: null, 
          month: month,
          monthName: monthName,
        };

        break;
      }
      case "greeting": {
        sendGreetingMessage(twiml);
        break;
      }
      case "add_reminder": {
        const { description, reminderDate, type } = interpretation.data;
        const dateFromAI = new Date(reminderDate);
        const normalizedDate = new Date(Date.UTC(
          dateFromAI.getUTCFullYear(),
          dateFromAI.getUTCMonth(),
          dateFromAI.getUTCDate(),
          0, 0, 0, 0 
        ));
        
        const newReminder = new Reminder({
          userId,
          description,
          reminderDate: normalizedDate,
          type,
          messageId: generateId(),
        });

        await newReminder.save();
        devLog("Novo lembrete salvo:", newReminder);
        
        await sendReminderMessage(twiml, messageToProcess, newReminder);
        break;
      }
      case "delete_reminder": {
        const { messageId } = interpretation.data;
        const reminder = await Reminder.findOneAndDelete({ userId, messageId });
        if (reminder) {
          sendReminderDeletedMessage(twiml, reminder);
        } else {
          sendOrLogMessage(
            twiml,
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
    sendOrLogMessage(
      twiml,
      "Ops! 🤖 Tive um curto-circuito aqui. Se foi um áudio, tente gravar em um lugar mais silencioso."
    );
  }

  res.writeHead(200, { "Content-Type": "text/xml" });
  res.end(twiml.toString());
});

export default router;
