import {
  sendOrLogMessage,
  sendChunkedMessage,
} from "../helpers/responseHelper.js";
import { devLog } from "../helpers/logger.js";
import { fromZonedTime } from "date-fns-tz";
import { TIMEZONE } from "../utils/dateUtils.js";
import express from "express";
import twilio from "twilio";
import { customAlphabet } from "nanoid";
import Expense from "../models/Expense.js";
import Income from "../models/Income.js";
import UserStats from "../models/UserStats.js";
import Reminder from "../models/Reminder.js";
import ElectricVehicle from "../models/ElectricVehicle.js";
import DependentRequest from "../models/DependentRequest.js";
import { ZEV_CONFIG } from "../utils/categories.js";
import Turn from "../models/Turn.js";
import {
  interpretUserMessage,
  transcribeAudioWithWhisper,
} from "../services/aiService.js";
import { generatePlatformChart } from "../services/chartService.js";
import { sendReportImage } from "../services/twilioService.js";
import {
  getProfitReportData,
  getTotalReminders,
  getExpenseDetails,
  getIncomeDetails,
  getExpensesByCategory,
  getIncomesBySource,
  getPeriodReport,
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
  sendPeriodReportMessage,
} from "../helpers/messages.js";

const router = express.Router();
let conversationState = {};

router.post("/", async (req, res) => {
  const twiml = new twilio.twiml.MessagingResponse();
  const userId = req.body.From;
  let responseSent = false;

  const finalizeResponse = () => {
    if (!responseSent) {
      res.writeHead(200, { "Content-Type": "text/xml" });
      res.end(twiml.toString());
      responseSent = true;
    }
  };

  try {
    let messageToProcess;
    if (req.body.MediaUrl0 && req.body.MediaContentType0.includes("audio")) {
      messageToProcess = await transcribeAudioWithWhisper(req.body.MediaUrl0);
    } else {
      messageToProcess = req.body.Body;
    }

    if (!messageToProcess || messageToProcess.trim() === "") {
      return res.end(twiml.toString());
    }
    devLog(`Mensagem de ${userId} para processar: "${messageToProcess}"`);

    let userStats = await UserStats.findOne({ userId });
    const currentState = conversationState[userId];

    if (messageToProcess.toLowerCase().trim() === "cancelar") {
      if (currentState) {
        delete conversationState[userId];
        sendOrLogMessage(twiml, "Ok, operação cancelada. 👍");
      } else {
        sendOrLogMessage(
          twiml,
          "Não há nenhuma operação em andamento para cancelar."
        );
      }
      return finalizeResponse();
    }

    // ========================== USUÁRIO DEPENDENTE ================================
    if (currentState && currentState.flow === "dependent_linking") {
      if (currentState.step === "awaiting_leader_phone") {
        let leaderPhoneNumber = messageToProcess.trim().replace(/\D/g, "");

        if (leaderPhoneNumber.length < 10 || leaderPhoneNumber.length > 13) {
          sendOrLogMessage(
            twiml,
            "❌ O número de telefone parece inválido. Por favor, envie o número completo, com código do país e DDD (ex: 5511912345678)."
          );
          return finalizeResponse();
        }

        const leaderUserId = `whatsapp:+${leaderPhoneNumber}`;
        const leaderExists = await UserStats.findOne({ userId: leaderUserId });

        if (!leaderExists) {
          sendOrLogMessage(
            twiml,
            "❌ Não encontrei um usuário líder com este número. Por favor, verifique e tente novamente."
          );
          return finalizeResponse();
        }

        await DependentRequest.findOneAndUpdate(
          { dependentUserId: userId },
          { leaderPhoneNumber, status: "pending" },
          { upsert: true, new: true }
        );

        sendOrLogMessage(
          twiml,
          "✅ Pedido de vinculação enviado com sucesso! Assim que sua solicitação for aprovada, você receberá uma notificação."
        );
        delete conversationState[userId];
      }
      return finalizeResponse();
    }
    // ==============================================================================

    // ========================== CADASTRAR VEÍCULO =================================
    if (currentState && currentState.flow === "ev_registration") {
      const config = ZEV_CONFIG;

      if (req.body.MediaUrl0 && req.body.MediaContentType0.includes("audio")) {
        sendOrLogMessage(
          twiml,
          `✋ Para garantir a precisão dos dados, o cadastro d${config.artigoDefinido} ${config.vehicleName} deve ser feito *apenas por texto*.`
        );
        return finalizeResponse();
      }

      devLog(
        `Fluxo de Cadastro de ${config.vehicleName} - Passo: ${currentState.step}`
      );
      const flowMessage = messageToProcess.trim();
      const isConfirmation = ["sim", "s"].includes(flowMessage.toLowerCase());

      switch (currentState.step) {
        case "awaiting_brand":
          currentState.tempData = flowMessage;
          currentState.step = "confirming_brand";
          sendOrLogMessage(
            twiml,
            `Você digitou: "*${flowMessage}*"\n\nEstá correto? Responda "*sim*" para confirmar, ou envie a marca novamente.`
          );
          break;
        case "confirming_brand":
          if (isConfirmation) {
            currentState.brand = currentState.tempData;
            delete currentState.tempData;
            currentState.step = "awaiting_model";
            sendOrLogMessage(
              twiml,
              `✅ Marca confirmada!\n\nAgora, qual o *modelo* d${config.artigoDefinido} ${config.vehicleName}?`
            );
          } else {
            currentState.tempData = flowMessage;
            sendOrLogMessage(
              twiml,
              `Ok, entendi: "*${flowMessage}*"\n\nCorreto? (Responda "*sim*" ou envie novamente)`
            );
          }
          break;
        case "awaiting_model":
          currentState.tempData = flowMessage;
          currentState.step = "confirming_model";
          sendOrLogMessage(
            twiml,
            `Modelo: "*${flowMessage}*"\n\nEstá correto? (Responda "*sim*" ou envie novamente)`
          );
          break;
        case "confirming_model":
          if (isConfirmation) {
            currentState.model = currentState.tempData;
            delete currentState.tempData;
            currentState.step = "awaiting_year";
            sendOrLogMessage(
              twiml,
              `✅ Modelo confirmado!\n\nQual o *ano* d${config.artigoDefinido} ${config.vehicleName}? (Ex: 2022)`
            );
          } else {
            currentState.tempData = flowMessage;
            sendOrLogMessage(
              twiml,
              `Ok, entendi: "*${flowMessage}*"\n\nCorreto? (Responda "*sim*" ou envie novamente)`
            );
          }
          break;
        case "awaiting_year":
          const currentYear = new Date().getFullYear();
          const inputYear = parseInt(flowMessage);
          if (
            isNaN(inputYear) ||
            flowMessage.length !== 4 ||
            inputYear > currentYear + 1
          ) {
            sendOrLogMessage(
              twiml,
              "Opa, o ano parece inválido. Por favor, envie apenas o ano com 4 dígitos (ex: 2021)."
            );
          } else {
            currentState.tempData = flowMessage;
            currentState.step = "confirming_year";
            sendOrLogMessage(
              twiml,
              `Ano: *${flowMessage}*\n\nEstá correto? (Responda "*sim*" ou envie novamente)`
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
            currentState.tempData = flowMessage;
            sendOrLogMessage(
              twiml,
              `Ok, entendi: *${flowMessage}*\n\nCorreto? (Responda "*sim*" ou envie novamente)`
            );
          }
          break;
        case "awaiting_mileage":
          const mileage = flowMessage.replace(/\D/g, "");
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

            const newEV = new ElectricVehicle({
              userId,
              brand: currentState.brand,
              model: currentState.model,
              year: currentState.year,
              initialMileage: currentState.mileage,
              currentMileage: currentState.mileage,
            });
            await newEV.save();

            await UserStats.findOneAndUpdate(
              { userId },
              { $set: { vehicleId: newEV._id } }
            );

            sendOrLogMessage(
              twiml,
              `${config.emoji} Prontinho! Seu *${currentState.brand} ${currentState.model}* foi cadastrado com sucesso.`
            );
            delete conversationState[userId];
          } else {
            const newMileage = flowMessage.replace(/\D/g, "");
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
        default:
          sendOrLogMessage(
            twiml,
            `Hmm, não entendi. Você está no meio do cadastro do seu carro elétrico. Digite 'cancelar' para sair.`
          );
          break;
      }
      return finalizeResponse();
    }
    // ==============================================================================

    // ============================ ONBOARDING ======================================
    if (!userStats) {
      const choice = messageToProcess.trim().toLowerCase();
      const onboardingStep = currentState?.onboardingStep;

      if (onboardingStep === "awaiting_type") {
        if (choice === "1" || choice.includes("líder")) {
          userStats = await UserStats.create({
            userId,
            isLeader: true,
          });
          conversationState[userId] = {
            flow: "ev_registration",
            step: "awaiting_brand",
          };
          sendOrLogMessage(
            twiml,
            `✅ Bem-vindo, líder! Para começar, vamos cadastrar seu carro elétrico.\n\nQual a marca dele?`
          );
        } else if (choice === "2" || choice.includes("dependente")) {
          await UserStats.create({
            userId,
            isDependent: false,
            leaderUserId: null,
          });
          conversationState[userId] = {
            flow: "dependent_linking",
            step: "awaiting_leader_phone",
          };
          sendOrLogMessage(
            twiml,
            "Entendido. Por favor, digite o número de WhatsApp do seu líder, com código do país e DDD (ex: 5511912345678)."
          );
        } else {
          sendOrLogMessage(
            twiml,
            "Opção inválida. Por favor, digite *1* para Líder ou *2* para Dependente."
          );
        }
      } else {
        conversationState[userId] = { onboardingStep: "awaiting_type" };
        const welcomeMsg =
          "👋 Bem-vindo(a) ao ADAP: Z-EV! Você é:\n\n*1* - Um usuário *Líder* (vai cadastrar o veículo e as finanças)\n*2* - Um usuário *Dependente* (vai se vincular a um líder)";
        sendOrLogMessage(twiml, welcomeMsg);
      }
      return finalizeResponse();
    }
    // ==============================================================================

    // =================== NOVO FLUXO: AGUARDANDO GANHOS DO TURNO ===================
    if (currentState && currentState.flow === "awaiting_turn_income") {
      sendOrLogMessage(
        twiml,
        "Ok, registrando seus ganhos e calculando o desempenho do turno... 🏁"
      );
      finalizeResponse();

      try {
        const interpretation = await interpretUserMessage(
          messageToProcess,
          new Date().toISOString()
        );

        let totalTurnIncome = 0;
        let totalRaces = 0;

        if (
          interpretation.intent === "submit_turn_income" &&
          interpretation.data.incomes
        ) {
          const turnIncomes = interpretation.data.incomes;

          for (const incomeData of turnIncomes) {
            const newIncome = new Income({
              userId: currentState.turnData.effectiveUserId,
              amount: incomeData.amount,
              description: `Ganhos da ${incomeData.source}`,
              category: "Corrida",
              source: incomeData.source,
              count: incomeData.count || 0,
              date: currentState.turnData.endDate,
              messageId: customAlphabet("1234567890abcdef", 5)(),
            });
            await newIncome.save();
            totalTurnIncome += incomeData.amount;
            totalRaces += incomeData.count || 0;
          }
        } else {
          const fallbackAmount = parseFloat(
            messageToProcess.replace(/[^0-9.,]/g, "").replace(",", ".")
          );
          if (!isNaN(fallbackAmount) && fallbackAmount > 0) {
            totalTurnIncome = fallbackAmount;
            await new Income({
              userId: currentState.turnData.effectiveUserId,
              amount: fallbackAmount,
              description: "Ganhos Totais do Turno",
              category: "Corrida",
              source: "Outros",
              date: currentState.turnData.endDate,
              messageId: customAlphabet("1234567890abcdef", 5)(),
            }).save();
          }
        }

        // <<< INÍCIO DA LÓGICA DE VERIFICAÇÃO DE META >>>
        // Este é o local ideal. Já temos o total de ganhos do turno.

        // Primeiro, buscamos os dados mais recentes do usuário líder, que contém a meta.
        const leaderStats = await UserStats.findOne({
          userId: currentState.turnData.effectiveUserId,
        });

        // Verificamos se existe uma meta para o turno atual e se a notificação ainda não foi enviada.
        if (
          leaderStats.currentTurnGoal &&
          leaderStats.currentTurnGoal.amount > 0 &&
          !leaderStats.currentTurnGoal.isNotified
        ) {
          // Comparamos o total de ganhos com a meta.
          if (totalTurnIncome >= leaderStats.currentTurnGoal.amount) {
            // Se a meta foi atingida, enviamos a mensagem de parabéns IMEDIATAMENTE.
            // Usamos 'sendTextMessage' pois estamos num processo assíncrono.
            await sendTextMessage(
              userId,
              `🎉 Parabéns! Você bateu sua meta de R$ ${leaderStats.currentTurnGoal.amount.toFixed(
                2
              )}! Todo ganho a partir de agora é bônus! 🚀`
            );

            // Atualizamos o status para não notificar de novo.
            await UserStats.updateOne(
              { userId: currentState.turnData.effectiveUserId },
              { $set: { "currentTurnGoal.isNotified": true } }
            );
          }
        }
        // <<< FIM DA LÓGICA DE VERIFICAÇÃO DE META >>>

        const { turnData } = currentState;

        const expenses = await Expense.find({
          userId: turnData.effectiveUserId,
          date: { $gte: turnData.startDate, $lte: turnData.endDate },
        });
        const totalExpense = expenses.reduce((sum, doc) => sum + doc.amount, 0);

        const totalProfit = totalTurnIncome - totalExpense;
        const earningsPerKm =
          turnData.distanceTraveled > 0
            ? totalTurnIncome / turnData.distanceTraveled
            : 0;
        const earningsPerRace =
          totalRaces > 0 ? totalTurnIncome / totalRaces : 0;

        const newTurn = new Turn({
          userId: turnData.effectiveUserId,
          startDate: turnData.startDate,
          endDate: turnData.endDate,
          startMileage: turnData.startMileage,
          endMileage: turnData.endMileage,
          distanceTraveled: turnData.distanceTraveled,
          totalIncome: totalTurnIncome,
          totalExpense,
          totalProfit,
          earningsPerKm,
        });
        await newTurn.save();

        await UserStats.updateOne(
          { userId: turnData.effectiveUserId },
          {
            $set: {
              isTurnActive: false,
              currentTurnStartMileage: 0,
              currentTurnStartDate: null,
            },
          }
        );
        await ElectricVehicle.updateOne(
          { _id: turnData.vehicleId },
          { $set: { currentMileage: turnData.endMileage } }
        );

        let summaryMessage = `*Resumo do seu Turno* 🏁\n\n`;
        summaryMessage += `💰 *Ganhos:* R$ ${totalTurnIncome.toFixed(2)}\n`;
        if (totalRaces > 0) {
          // CORREÇÃO: Adicionando emoji e negrito para consistência.
          summaryMessage += `🏁 *Corridas:* ${totalRaces}\n`;
        }
        summaryMessage += `💸 *Gastos:* R$ ${totalExpense.toFixed(2)}\n`;
        summaryMessage += `✅ *Lucro:* R$ ${totalProfit.toFixed(2)}\n\n`;
        summaryMessage += `*Métricas de Desempenho:*\n`;
        summaryMessage += `› *R$/km rodado:* R$ ${earningsPerKm.toFixed(2)}\n`;
        if (earningsPerRace > 0) {
          summaryMessage += `› *Média p/ corrida:* R$ ${earningsPerRace.toFixed(
            2
          )}\n`;
        }
        summaryMessage += `› *Distância total:* ${turnData.distanceTraveled.toFixed(
          1
        )} km`;

        await sendChunkedMessage(userId, summaryMessage);
      } catch (error) {
        devLog("ERRO CRÍTICO ao finalizar turno e registrar ganhos:", error);
        await sendChunkedMessage(
          userId,
          "❌ Ops! Tive um problema ao calcular o resumo do seu turno. Tente encerrá-lo novamente."
        );
      } finally {
        delete conversationState[userId];
      }
      return;
    }
    // ==============================================================================

    let effectiveUserId = userId;
    let isUserDependent = false;

    if (userStats.isDependent && userStats.leaderUserId) {
      effectiveUserId = userStats.leaderUserId;
      isUserDependent = true;
      devLog(
        `Usuário ${userId} é um dependente. Usando ID do líder: ${effectiveUserId}`
      );
    }

    const generateId = customAlphabet("1234567890abcdef", 5);
    const todayISO = new Date().toISOString();

    const interpretation = await interpretUserMessage(
      messageToProcess,
      todayISO
    );
    devLog(`Intenção da IA:`, interpretation.intent);

    switch (interpretation.intent) {
      case "start_turn": {
        let turnContextStats = userStats;
        if (isUserDependent) {
          turnContextStats = await UserStats.findOne({
            userId: effectiveUserId,
          });
        }

        if (turnContextStats.isTurnActive) {
          sendOrLogMessage(
            twiml,
            "Você (ou seu líder) já está com um turno em andamento. Para iniciar um novo, primeiro encerre o atual."
          );
          break;
        }

        const { mileage } = interpretation.data;

        if (!mileage || typeof mileage !== "number" || mileage < 0) {
          sendOrLogMessage(
            twiml,
            "Não entendi a quilometragem. Por favor, tente novamente. Ex: *iniciar turno 12345 km*"
          );
          break;
        }

        const startTime = new Date();

        await UserStats.updateOne(
          { userId: effectiveUserId },
          {
            $set: {
              isTurnActive: true,
              currentTurnStartMileage: mileage,
              currentTurnStartDate: startTime,
              currentTurnGoal: null,
            },
          }
        );

        await ElectricVehicle.updateOne(
          { _id: turnContextStats.vehicleId },
          { $set: { currentMileage: mileage } }
        );

        const formattedTime = startTime.toLocaleTimeString("pt-BR", {
          hour: "2-digit",
          minute: "2-digit",
          timeZone: TIMEZONE,
        });
        sendOrLogMessage(
          twiml,
          `✅ Turno iniciado às *${formattedTime}* com *${mileage.toLocaleString(
            "pt-BR"
          )} km*.\n\nBoas corridas! ⚡`
        );
        break;
      }
      case "end_turn": {
        let turnContextStats = userStats;
        if (isUserDependent) {
          turnContextStats = await UserStats.findOne({
            userId: effectiveUserId,
          });
        }

        if (!turnContextStats.isTurnActive) {
          sendOrLogMessage(
            twiml,
            "Você (ou seu líder) não tem um turno ativo no momento."
          );
          break;
        }

        const { mileage: endMileage } = interpretation.data;

        if (
          !endMileage ||
          typeof endMileage !== "number" ||
          endMileage < turnContextStats.currentTurnStartMileage
        ) {
          sendOrLogMessage(
            twiml,
            `A quilometragem final parece inválida. Ela deve ser um número maior que a quilometragem inicial de *${turnContextStats.currentTurnStartMileage.toLocaleString(
              "pt-BR"
            )} km*.`
          );
          break;
        }

        conversationState[userId] = {
          flow: "awaiting_turn_income",
          turnData: {
            effectiveUserId,
            vehicleId: turnContextStats.vehicleId,
            startDate: turnContextStats.currentTurnStartDate,
            endDate: new Date(),
            startMileage: turnContextStats.currentTurnStartMileage,
            endMileage,
            distanceTraveled:
              endMileage - turnContextStats.currentTurnStartMileage,
          },
        };

        sendOrLogMessage(
          twiml,
          "🏁 Turno encerrado!\n\nAgora, por favor, me informe seus ganhos e o número de corridas por plataforma.\n\n*Exemplo:* `250 na z-ev em 10 corridas, 120 na uber em 5 corridas`"
        );

        break;
      }
      case "set_turn_goal": {
        if (!userStats.isTurnActive) {
          sendOrLogMessage(
            twiml,
            "Você precisa iniciar um turno antes de definir uma meta! 😉"
          );
          break;
        }
        const { amount } = interpretation.data;
        if (!amount || amount <= 0) {
          sendOrLogMessage(
            twiml,
            "Não entendi o valor da meta. Tente de novo. Ex: `meta de hoje 350`"
          );
          break;
        }

        await UserStats.updateOne(
          { userId },
          { $set: { currentTurnGoal: { amount, isNotified: false } } }
        );
        sendOrLogMessage(
          twiml,
          `🎯 Meta definida! Vou te avisar quando você atingir *R$ ${amount.toFixed(
            2
          )}* em ganhos neste turno.`
        );
        break;
      } // adicionado
      case "set_turn_reminder": {
        const { time } = interpretation.data;
        if (!time || !/^\d{2}:\d{2}$/.test(time)) {
          sendOrLogMessage(
            twiml,
            "Não entendi o horário. Por favor, tente de novo. Ex: `lembrete de turno 8h`"
          );
          break;
        }

        await UserStats.updateOne(
          { userId },
          { $set: { turnStartReminderTime: time } }
        );
        sendOrLogMessage(
          twiml,
          `✅ Prontinho! Vou te lembrar de iniciar seu turno todos os dias às *${time}*.`
        );
        break;
      } // adicionado
      case "get_vehicle_details": {
        if (isUserDependent) {
          sendOrLogMessage(
            twiml,
            "Como dependente, você não possui um veículo próprio cadastrado. Esta ação é para o seu líder."
          );
          break;
        }
        if (!userStats.vehicleId) {
          sendOrLogMessage(
            twiml,
            "⚡ Você ainda não cadastrou seu carro elétrico. Para começar, siga as instruções que enviei no início."
          );
          break;
        }
        const ev = await ElectricVehicle.findById(userStats.vehicleId);
        const evMessage = `*Seu Z-EV Ativo* ⚡\n\n*Marca:* ${
          ev.brand
        }\n*Modelo:* ${ev.model}\n*Ano:* ${
          ev.year
        }\n*KM Atual:* ${ev.currentMileage.toLocaleString("pt-BR")} km`;
        sendOrLogMessage(twiml, evMessage);
        break;
      }
      case "add_income": {
        let { amount, description, category, source } = interpretation.data;

        if (category === "Corrida") {
          sendOrLogMessage(
            twiml,
            "Para registrar os ganhos de corridas, primeiro encerre seu turno com o comando `encerrar turno [km final]`."
          );
          break;
        }

        const newIncome = new Income({
          userId: effectiveUserId,
          amount,
          description,
          category,
          source,
          date: new Date(),
          messageId: generateId(),
        });
        await newIncome.save();
        sendIncomeAddedMessage(twiml, newIncome);
        await UserStats.findOneAndUpdate(
          { userId: effectiveUserId },
          { $inc: { totalIncome: amount } },
          { upsert: true }
        );
        break;
      }
      case "add_expense": {
        const { amount, description, category, kwh } = interpretation.data;

        const newExpense = new Expense({
          userId: effectiveUserId,
          amount,
          description,
          category,
          kwh,
          date: new Date(),
          messageId: generateId(),
        });

        await newExpense.save();
        devLog("Nova despesa salva:", newExpense);
        let expenseMessage = `💸 *Gasto anotado!*
📌 ${
          newExpense.description.charAt(0).toUpperCase() +
          newExpense.description.slice(1)
        } (_${newExpense.category}_)
❌ *R$ ${newExpense.amount.toFixed(2)}*`;

        if (newExpense.kwh && newExpense.kwh > 0) {
          expenseMessage += `\n⚡️ *Recarga:* ${newExpense.kwh} kWh`;
        }

        expenseMessage += `\n🆔 #${newExpense.messageId}`;
        sendOrLogMessage(twiml, expenseMessage);

        await UserStats.findOneAndUpdate(
          { userId: effectiveUserId },
          { $inc: { totalSpent: amount } },
          { upsert: true }
        );
        break;
      }
      case "get_period_report": {
        const { period, month, monthName } = interpretation.data;

        const reportOptions = { period, month, monthName };

        if (!period && !month) {
          reportOptions.period = "week";
        }

        const reportData = await getPeriodReport(
          effectiveUserId,
          reportOptions
        );

        sendPeriodReportMessage(twiml, reportData);

        break;
      }
      case "generate_platform_chart": {
        sendOrLogMessage(
          twiml,
          "📊 Certo! Preparando seu gráfico de ganhos por plataforma..."
        );

        finalizeResponse();

        try {
          const now = new Date();
          const currentMonth = `${now.getFullYear()}-${String(
            now.getMonth() + 1
          ).padStart(2, "0")}`;

          devLog(
            `Buscando dados para o gráfico de plataformas do mês: ${currentMonth}`
          );
          const reportData = await getIncomesBySource(
            effectiveUserId,
            currentMonth,
            null
          );

          if (reportData.length === 0) {
            await sendChunkedMessage(
              userId,
              "Não encontrei nenhum ganho este mês para gerar o gráfico. 🤷‍♂️"
            );
            break;
          }

          devLog("Gerando a imagem e fazendo upload para o Cloudinary...");
          const imageUrl = await generatePlatformChart(reportData, userId);

          devLog(`Enviando imagem do gráfico via Cloudinary URL: ${imageUrl}`);
          await sendReportImage(
            effectiveUserId,
            imageUrl,
            "Seu gráfico de ganhos por plataforma está pronto!"
          );
        } catch (error) {
          devLog("❌ Erro ao gerar o gráfico de plataformas:", error);
          await sendChunkedMessage(
            userId,
            "❌ Desculpe, ocorreu um erro ao tentar gerar seu gráfico. Tente novamente mais tarde."
          );
        }
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
        const expenses = await getExpensesByCategory(
          effectiveUserId,
          month,
          category
        );
        if (expenses.length === 0) {
          sendOrLogMessage(
            twiml,
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
        sendOrLogMessage(twiml, message);
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
        const incomes = await getIncomesBySource(
          effectiveUserId,
          month,
          source
        );

        const config = PROFILE_CONFIG;
        const incomeTermPlural =
          config.incomeTerm === "Entrega" ? "entregas" : "corridas";

        if (incomes.length === 0) {
          sendOrLogMessage(
            twiml,
            `Você não tem nenhuma ${incomeTermPlural} registrada em *${monthName}* ${
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

          const detailsLine = `_${
            inc.count
          } ${incomeTermPlural} | ${inc.totalDistance.toFixed(
            1
          )} km | R$ ${averageRperKm.toFixed(2)} por km_`;

          message += `\n*${inc._id}: R$ ${inc.total.toFixed(
            2
          )}*\n${detailsLine}\n`;
        });

        message += `\n*Total Recebido:* R$ ${totalIncome.toFixed(2)}`;
        message += `\n\n_Digite "detalhes ${incomeTermPlural}" para ver a lista completa._`;

        conversationState[userId] = {
          type: "income",
          month,
          monthName,
          source,
        };
        sendOrLogMessage(twiml, message);
        break;
      }
      case "get_transaction_details": {
        let { type } = interpretation.data;
        const previousData = conversationState[userId];

        if (!previousData || !previousData.month) {
          sendOrLogMessage(
            twiml,
            "Não há um relatório recente para detalhar. Peça um resumo de gastos ou ganhos primeiro."
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

        sendOrLogMessage(
          twiml,
          "🧾 Ok! Gerando seu relatório detalhado, um momento..."
        );

        finalizeResponse();

        const { month, monthName, category, source } = previousData;
        devLog(`Buscando detalhes para: Tipo=${type}, Mês=${month}`);

        const detailsMessage =
          type === "income"
            ? await getIncomeDetails(effectiveUserId, month, monthName, source)
            : await getExpenseDetails(
                effectiveUserId,
                month,
                monthName,
                category
              );

        await sendChunkedMessage(userId, detailsMessage);

        delete conversationState[userId];

        break;
      }
      case "delete_transaction": {
        const { messageId } = interpretation.data;
        const income = await Income.findOneAndDelete({
          userId: effectiveUserId,
          messageId,
        });

        if (income) {
          await UserStats.findOneAndUpdate(
            { userId: effectiveUserId },
            { $inc: { totalIncome: -income.amount } }
          );
          sendIncomeDeletedMessage(twiml, income);
        } else {
          const expense = await Expense.findOneAndDelete({
            userId: effectiveUserId,
            messageId,
          });
          if (expense) {
            await UserStats.findOneAndUpdate(
              { userId: effectiveUserId },
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
      case "greeting": {
        sendGreetingMessage(twiml);
        break;
      }
      case "add_reminder": {
        const { description, date, type, relativeMinutes } =
          interpretation.data;

        if (!date && !relativeMinutes) {
          sendOrLogMessage(
            twiml,
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
          sendOrLogMessage(
            twiml,
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

  finalizeResponse();
});

export default router;
