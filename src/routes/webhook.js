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
import Vehicle from "../models/Vehicle.js";
import Motorcycle from "../models/Motorcycle.js";
import ElectricVehicle from "../models/ElectricVehicle.js";
import DependentRequest from "../models/DependentRequest.js";
import { PROFILE_CONFIG } from "../utils/categories.js";
import Turn from "../models/Turn.js";
import {
  interpretDriverMessage,
  interpretMotoboyMessage,
  interpretZEVMessage,
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

    // LÓGICA PARA O FLUXO DE VINCULAÇÃO DE DEPENDENTE
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

    // LÓGICA PARA FLUXOS DE CONVERSAÇÃO ATIVOS
    if (
      currentState &&
      (currentState.flow === "vehicle_registration" ||
        currentState.flow === "motorcycle_registration" ||
        currentState.flow === "ev_registration")
    ) {
      let config;
      if (currentState.flow === "motorcycle_registration") {
        config = PROFILE_CONFIG.motoboy;
      } else if (currentState.flow === "ev_registration") {
        config = PROFILE_CONFIG.zev_driver;
      } else {
        config = PROFILE_CONFIG.driver;
      }

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

            if (currentState.flow === "motorcycle_registration") {
              const newMotorcycle = new Motorcycle({
                userId,
                brand: currentState.brand,
                model: currentState.model,
                year: currentState.year,
                initialMileage: currentState.mileage,
                currentMileage: currentState.mileage,
              });
              await newMotorcycle.save();
              await UserStats.findOneAndUpdate(
                { userId },
                {
                  $set: {
                    activeMotorcycleId: newMotorcycle._id,
                    activeProfile: "motoboy",
                  },
                }
              );
            } else if (currentState.flow === "ev_registration") {
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
                { $set: { activeEVId: newEV._id, activeProfile: "zev_driver" } }
              );
            } else {
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
                {
                  $set: {
                    activeVehicleId: newVehicle._id,
                    activeProfile: "driver",
                  },
                }
              );
            }
            sendOrLogMessage(
              twiml,
              `${config.emoji} Prontinho! ${
                config.pronomePossessivo.charAt(0).toUpperCase() +
                config.pronomePossessivo.slice(1)
              } *${currentState.brand} ${
                currentState.model
              }* foi cadastrado com sucesso.`
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
            `Hmm, não entendi. Você está no meio do cadastro d${config.artigoDefinido} ${config.vehicleName}. Digite 'cancelar' para sair.`
          );
          break;
      }
      return finalizeResponse();
    }

    // LÓGICA DE ONBOARDING PARA NOVOS USUÁRIOS
    if (!userStats) {
      const choice = messageToProcess.trim().toLowerCase();
      const onboardingStep = currentState?.onboardingStep;

      if (onboardingStep === "awaiting_type") {
        if (["1", "2", "3"].includes(choice)) {
          let profileType;
          if (choice === "1") profileType = "driver";
          if (choice === "2") profileType = "motoboy";
          if (choice === "3") profileType = "zev_driver";

          userStats = await UserStats.create({
            userId,
            profiles: { [profileType]: true },
            activeProfile: profileType,
            welcomedToV2: true,
            isLeader: true,
          });

          const config = PROFILE_CONFIG[profileType];
          const flow =
            profileType === "motoboy"
              ? "motorcycle_registration"
              : profileType === "zev_driver"
              ? "ev_registration"
              : "vehicle_registration";

          conversationState[userId] = { flow, step: "awaiting_brand" };
          sendOrLogMessage(
            twiml,
            `✅ Perfil criado! Para finalizar, vamos cadastrar ${config.pronomePossessivo} ${config.vehicleName}.\n\nQual a marca ${config.generoObjeto}?`
          );
        } else if (choice === "dependente") {
          await UserStats.create({
            userId,
            isDependent: false,
            leaderUserId: null,
            profiles: { driver: false, motoboy: false, zev_driver: false },
            activeProfile: null,
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
            "Opção inválida. Por favor, digite *dependente* ou um dos números (1, 2 ou 3)."
          );
        }
      } else {
        conversationState[userId] = { onboardingStep: "awaiting_type" };
        const welcomeMsg =
          "👋 Bem-vindo(a) ao ADAP! Você é um usuário principal ou um dependente?\n\n› Digite *dependente* para se vincular a um líder.\n\n*OU ESCOLHA SEU PERFIL PRINCIPAL:*\n*1* - Motorista de App 🚗\n*2* - Entregador de Moto 🏍️\n*3* - Motorista Z-EV ⚡";
        sendOrLogMessage(twiml, welcomeMsg);
      }
      return finalizeResponse();
    }

    // LÓGICA DE PERFIL E DEPENDENTE UNIFICADA
    if (!userStats) {
      sendOrLogMessage(twiml, "Olá! Parece que você é novo por aqui. Diga 'oi' novamente para começar.");
      return finalizeResponse();
    }

    let activeProfile = userStats.activeProfile;
    let effectiveUserId = userId;
    let isUserDependent = false;

    if (userStats.isDependent && userStats.leaderUserId) {
      effectiveUserId = userStats.leaderUserId;
      isUserDependent = true;
      devLog(`Usuário ${userId} é um dependente. Usando ID do líder: ${effectiveUserId}`);
      
      const leaderStats = await UserStats.findOne({ userId: effectiveUserId });
      if (leaderStats) {
        activeProfile = leaderStats.activeProfile; 
      } else {
        sendOrLogMessage(twiml, "Opa! Não encontrei os dados do seu líder. Por favor, peça para ele verificar a conta.");
        return finalizeResponse();
      }
    }

    if (!activeProfile) {
        sendOrLogMessage(twiml, "Seu perfil ainda não está totalmente configurado. Peça ao seu líder para definir um perfil de trabalho ativo.");
        return finalizeResponse();
    }
    
    const activeProfileConfig = PROFILE_CONFIG[activeProfile];

    // <<< FLUXO DE GANHOS DE TURNO (VERSÃO FINAL E CORRIGIDA) >>>
    if (currentState && currentState.flow === "awaiting_turn_income") {
      const { turnData } = currentState;

      const interpretation = await (async () => {
        if (activeProfile === "zev_driver") return interpretZEVMessage(messageToProcess, new Date().toISOString());
        if (activeProfile === "motoboy") return interpretMotoboyMessage(messageToProcess, new Date().toISOString());
        return interpretDriverMessage(messageToProcess, new Date().toISOString());
      })();

      if (interpretation.intent !== "submit_turn_income") {
        sendOrLogMessage(twiml, "Não entendi o formato dos ganhos. Por favor, tente novamente.\n\n*Exemplo:* `uber 100 5, 99pop 80 4`");
        return finalizeResponse();
      }

      sendOrLogMessage(twiml, "Ok, registrando seus ganhos e calculando o desempenho do turno... 🏁");
      finalizeResponse();

      try {
        let totalTurnIncome = 0;
        let totalRaces = 0;

        if (interpretation.data.incomes) {
          const turnIncomes = interpretation.data.incomes;
          for (const incomeData of turnIncomes) {
            let categoryForIncome = activeProfileConfig.incomeTerm;
            if (activeProfile === 'motoboy') {
              categoryForIncome = incomeData.incomeType || 'Entrega';
            }
            const newIncome = new Income({
              userId: turnData.effectiveUserId,
              amount: incomeData.amount,
              description: `Ganhos da ${incomeData.source}`,
              category: categoryForIncome,
              source: incomeData.source,
              count: incomeData.count || 0,
              profileType: activeProfile,
              date: turnData.endDate,
              messageId: customAlphabet("1234567890abcdef", 5)(),
            });
            await newIncome.save();
            totalTurnIncome += incomeData.amount;
            totalRaces += incomeData.count || 0;
          }
        }
        
        const leaderStats = await UserStats.findOne({ userId: turnData.effectiveUserId });
        if (leaderStats.currentTurnGoal && !leaderStats.currentTurnGoal.isNotified && totalTurnIncome >= leaderStats.currentTurnGoal.amount) {
          await sendChunkedMessage(userId, `🎉 Parabéns! Você bateu sua meta de R$ ${leaderStats.currentTurnGoal.amount.toFixed(2)}!`);
          await UserStats.updateOne({ userId: turnData.effectiveUserId }, { $set: { "currentTurnGoal.isNotified": true } });
        }

        const expenses = await Expense.find({ userId: turnData.effectiveUserId, profileType: activeProfile, date: { $gte: turnData.startDate, $lte: turnData.endDate }});
        const totalExpense = expenses.reduce((sum, doc) => sum + doc.amount, 0);
        const totalProfit = totalTurnIncome - totalExpense;
        const earningsPerKm = turnData.distanceTraveled > 0 ? totalTurnIncome / turnData.distanceTraveled : 0;
        const earningsPerRace = totalRaces > 0 ? totalTurnIncome / totalRaces : 0;

        const newTurn = new Turn({
          userId: turnData.effectiveUserId, 
          profileType: turnData.activeProfile, 
          startDate: turnData.startDate,
          endDate: turnData.endDate,
          startMileage: turnData.startMileage,
          endMileage: turnData.endMileage,
          distanceTraveled: turnData.distanceTraveled,
          totalIncome: totalTurnIncome,
          totalExpense: totalExpense,
          totalProfit: totalProfit,
          earningsPerKm: earningsPerKm,
          racesCount: totalRaces,
        });
        await newTurn.save();
        
        await UserStats.updateOne({ userId: turnData.effectiveUserId }, { $set: { isTurnActive: false, currentTurnStartMileage: 0, currentTurnStartDate: null }});
        
        let vehicleModel;
        switch(activeProfile) {
            case 'driver': vehicleModel = Vehicle; break;
            case 'motoboy': vehicleModel = Motorcycle; break;
            case 'zev_driver': vehicleModel = ElectricVehicle; break;
        }
        if (vehicleModel && turnData.vehicleId) {
            await vehicleModel.updateOne({ _id: turnData.vehicleId }, { $set: { currentMileage: turnData.endMileage } });
        }

        let summaryMessage = `*Resumo do seu Turno* 🏁\n\n`;
        summaryMessage += `💰 *Ganhos:* R$ ${totalTurnIncome.toFixed(2)}\n`;
        if (totalRaces > 0) summaryMessage += `🏁 *${activeProfileConfig.incomeTerm === 'Entrega' ? 'Entregas/Corridas' : 'Corridas'}:* ${totalRaces}\n`;
        summaryMessage += `💸 *Gastos:* R$ ${totalExpense.toFixed(2)}\n`;
        summaryMessage += `✅ *Lucro:* R$ ${totalProfit.toFixed(2)}\n\n`;
        summaryMessage += `*Métricas de Desempenho:*\n`;
        summaryMessage += `› *R$/km rodado:* R$ ${earningsPerKm.toFixed(2)}\n`;
        if (earningsPerRace > 0) summaryMessage += `› *Média p/ registro:* R$ ${earningsPerRace.toFixed(2)}\n`;
        summaryMessage += `› *Distância total:* ${turnData.distanceTraveled.toFixed(1)} km`;
        await sendChunkedMessage(userId, summaryMessage);

      } catch (error) { devLog("ERRO CRÍTICO ao finalizar turno:", error); } 
      finally { delete conversationState[userId]; }
      return;
    }

    const generateId = customAlphabet("1234567890abcdef", 5);
    const todayISO = new Date().toISOString();

    let interpretation;

    if (activeProfile === "zev_driver")
      interpretation = await interpretZEVMessage(messageToProcess, todayISO);
    else if (activeProfile === "motoboy")
      interpretation = await interpretMotoboyMessage(
        messageToProcess,
        todayISO
      );
    else
      interpretation = await interpretDriverMessage(messageToProcess, todayISO);

    devLog(
      `Intenção da IA para perfil '${activeProfile}':`,
      interpretation.intent
    );

    switch (interpretation.intent) {
      case "switch_profile": {
        const { profile } = interpretation.data;
        let profileName = "";

        if (userStats.profiles[profile]) {
          userStats.activeProfile = profile;
          await userStats.save();

          switch (profile) {
            case "driver":
              profileName = "Motorista 🚗";
              break;
            case "motoboy":
              profileName = "Entregador 🏍️";
              break;
            case "zev_driver":
              profileName = "Motorista Z-EV ⚡";
              break;
          }
          sendOrLogMessage(twiml, `✅ Perfil alterado para *${profileName}*!`);
        } else {
          switch (profile) {
            case "driver":
              profileName = "Motorista";
              break;
            case "motoboy":
              profileName = "Entregador";
              break;
            case "zev_driver":
              profileName = "Motorista Z-EV";
              break;
            default:
              profileName = "solicitado";
              break;
          }
          sendOrLogMessage(
            twiml,
            `Você ainda não tem um perfil de ${profileName}. Diga *"adicionar perfil de ${profileName.toLowerCase()}"* para criar um.`
          );
        }
        break;
      }
      case "add_profile": {
        const { profile } = interpretation.data;
        if (!profile) {
          sendOrLogMessage(
            twiml,
            "Não entendi qual perfil você quer adicionar. Tente dizer 'adicionar perfil de motorista', 'motoboy' ou 'Z-EV'."
          );
          break;
        }

        if (userStats.profiles[profile]) {
          sendOrLogMessage(twiml, "Você já tem este perfil!");
          break;
        }

        await UserStats.updateOne(
          { userId },
          { $set: { [`profiles.${profile}`]: true } }
        );
        const config = PROFILE_CONFIG[profile];
        let flow;
        switch (profile) {
          case "driver":
            flow = "vehicle_registration";
            break;
          case "motoboy":
            flow = "motorcycle_registration";
            break;
          case "zev_driver":
            flow = "ev_registration";
            break;
        }
        conversationState[userId] = { flow, step: "awaiting_brand" };
        sendOrLogMessage(
          twiml,
          `✅ Perfil de ${config.name} adicionado! Para finalizar, vamos cadastrar ${config.pronomePossessivo} ${config.vehicleName}.\n\nQual a marca ${config.generoObjeto}?`
        );
        break;
      }
      case "start_turn": {
        if (userStats.isTurnActive) {
          sendOrLogMessage(twiml, "Você já está com um turno em andamento. Para iniciar um novo, primeiro encerre o atual.");
          break;
        }
        const { mileage } = interpretation.data;
        if (!mileage || typeof mileage !== "number" || mileage < 0) {
          sendOrLogMessage(twiml, "Não entendi a quilometragem. Ex: `iniciar turno 12345 km`");
          break;
        }

        let vehicleModel, vehicleId;
        switch (activeProfile) {
          case "driver":
            vehicleModel = Vehicle;
            vehicleId = userStats.activeVehicleId;
            break;
          case "motoboy":
            vehicleModel = Motorcycle;
            vehicleId = userStats.activeMotorcycleId;
            break;
          case "zev_driver":
            vehicleModel = ElectricVehicle;
            vehicleId = userStats.activeEVId;
            break;
        }

        if (vehicleModel && vehicleId) {
          const currentVehicle = await vehicleModel.findById(vehicleId);
          if (currentVehicle && mileage < currentVehicle.currentMileage) {
            sendOrLogMessage(
              twiml,
              `Opa! A quilometragem informada (*${mileage.toLocaleString("pt-BR")} km*) é menor que a última registrada (*${currentVehicle.currentMileage.toLocaleString("pt-BR")} km*). Por favor, verifique e tente novamente.`
            );
            break; 
          }
        }

        await UserStats.updateOne(
          { userId: effectiveUserId },
          {
            $set: {
              isTurnActive: true,
              currentTurnStartMileage: mileage,
              currentTurnStartDate: new Date(),
              currentTurnGoal: null,
            },
          }
        );

        if (vehicleModel && vehicleId) {
          await vehicleModel.updateOne(
            { _id: vehicleId },
            { $set: { currentMileage: mileage } }
          );
        }

        sendOrLogMessage(
          twiml,
          `✅ Turno iniciado com ${mileage.toLocaleString("pt-BR")} km. Boas corridas!`
        );
        break;
      }
      case "end_turn": {
        if (!userStats.isTurnActive) {
          sendOrLogMessage(twiml, "Você não tem um turno ativo no momento.");
          break;
        }
        const { mileage: endMileage } = interpretation.data;
        if (
          !endMileage ||
          typeof endMileage !== "number" ||
          endMileage < userStats.currentTurnStartMileage
        ) {
          sendOrLogMessage(
            twiml,
            `A quilometragem final parece inválida. Deve ser maior que a inicial de ${userStats.currentTurnStartMileage.toLocaleString(
              "pt-BR"
            )} km.`
          );
          break;
        }

        let vehicleId;
        switch (activeProfile) {
          case "driver":
            vehicleId = userStats.activeVehicleId;
            break;
          case "motoboy":
            vehicleId = userStats.activeMotorcycleId;
            break;
          case "zev_driver":
            vehicleId = userStats.activeEVId;
            break;
        }

        conversationState[userId] = {
          flow: "awaiting_turn_income",
          turnData: {
            effectiveUserId,
            vehicleId,
            activeProfile,
            startDate: userStats.currentTurnStartDate,
            endDate: new Date(),
            startMileage: userStats.currentTurnStartMileage,
            endMileage,
            distanceTraveled: endMileage - userStats.currentTurnStartMileage,
          },
        };

        sendOrLogMessage(
          twiml,
          `🏁 Turno encerrado! Agora, informe seus ganhos.\n\n*Exemplo:* ${activeProfileConfig.incomeExample}`
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
          { userId: effectiveUserId },
          { $set: { currentTurnGoal: { amount, isNotified: false } } }
        );
        sendOrLogMessage(
          twiml,
          `🎯 Meta definida! Vou te avisar quando você atingir *R$ ${amount.toFixed(
            2
          )}* neste turno.`
        );
        break;
      }
      case "set_turn_reminder": {
        const { time } = interpretation.data;

        if (!time || !/^\d{2}:\d{2}$/.test(time)) {
          sendOrLogMessage(
            twiml,
            "Não entendi o horário. Por favor, tente de novo. Ex: `lembrete de turno 8h` ou `lembrete turno 19:30`"
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
      }
      case "get_vehicle_details": {
        if (isUserDependent) {
          sendOrLogMessage(
            twiml,
            "Como dependente, você não possui um veículo próprio cadastrado. Esta ação é para o seu líder."
          );
          break;
        }
        const config = PROFILE_CONFIG["driver"];
        if (!userStats.activeVehicleId) {
          sendOrLogMessage(
            twiml,
            `${config.emoji} Você ainda não cadastrou ${config.artigoIndefinido} ${config.vehicleName}. Diga "adicionar perfil de motorista" para começar.`
          );
          break;
        }
        const vehicle = await Vehicle.findById(userStats.activeVehicleId);
        const vehicleMessage = `*Seu ${
          config.vehicleName.charAt(0).toUpperCase() +
          config.vehicleName.slice(1)
        } Ativo* ${config.emoji}\n\n*Marca:* ${vehicle.brand}\n*Modelo:* ${
          vehicle.model
        }\n*Ano:* ${
          vehicle.year
        }\n*KM Atual:* ${vehicle.currentMileage.toLocaleString("pt-BR")} km`;
        sendOrLogMessage(twiml, vehicleMessage);
        break;
      }
      case "get_motorcycle_details": {
        if (isUserDependent) {
          sendOrLogMessage(
            twiml,
            "Como dependente, você não possui um veículo próprio cadastrado. Esta ação é para o seu líder."
          );
          break;
        }
        const config = PROFILE_CONFIG["motoboy"];
        if (!userStats.activeMotorcycleId) {
          sendOrLogMessage(
            twiml,
            `${config.emoji} Você ainda não cadastrou ${config.artigoIndefinido} ${config.vehicleName}. Diga "adicionar perfil de moto" para começar.`
          );
          break;
        }
        const motorcycle = await Motorcycle.findById(
          userStats.activeMotorcycleId
        );
        const motorcycleMessage = `*Sua ${
          config.vehicleName.charAt(0).toUpperCase() +
          config.vehicleName.slice(1)
        } Ativa* ${config.emoji}\n\n*Marca:* ${motorcycle.brand}\n*Modelo:* ${
          motorcycle.model
        }\n*Ano:* ${
          motorcycle.year
        }\n*KM Atual:* ${motorcycle.currentMileage.toLocaleString("pt-BR")} km`;
        sendOrLogMessage(twiml, motorcycleMessage);
        break;
      }
      case "get_ev_details": {
        if (isUserDependent) {
          sendOrLogMessage(
            twiml,
            "Como dependente, você não possui um veículo próprio cadastrado. Esta ação é para o seu líder."
          );
          break;
        }
        if (!userStats.activeEVId) {
          sendOrLogMessage(
            twiml,
            "⚡ Você ainda não cadastrou seu carro elétrico. Use o comando 'adicionar perfil z-ev'."
          );
          break;
        }
        const ev = await ElectricVehicle.findById(userStats.activeEVId);
        const evMessage = `*Seu Z-EV Ativo* ⚡\n\n*Marca:* ${
          ev.brand
        }\n*Modelo:* ${ev.model}\n*Ano:* ${
          ev.year
        }\n*KM Atual:* ${ev.currentMileage.toLocaleString("pt-BR")} km`;
        sendOrLogMessage(twiml, evMessage);
        break;
      }
      case "add_expense": {
        const { amount, description, category, kwh } = interpretation.data;
        const newExpense = new Expense({
          userId: effectiveUserId,
          amount,
          description,
          category,
          kwh: activeProfile === "zev_driver" ? kwh : undefined,
          profileType: activeProfile,
          date: new Date(),
          messageId: generateId(),
        });
        await newExpense.save();
        sendExpenseAddedMessage(twiml, newExpense);
        await UserStats.findOneAndUpdate(
          { userId: effectiveUserId },
          { $inc: { totalSpent: amount } },
          { upsert: true }
        );
        break;
      }
      case "add_income": {
        const { amount, description, category, source, distance } =
          interpretation.data;

        if (
          (category === "Corrida" || category === "Entrega") &&
          (!distance || distance <= 0)
        ) {
          if (activeProfile === "driver" || activeProfile === "zev_driver") {
            sendOrLogMessage(
              twiml,
              `Para registrar uma ${category.toLowerCase()} particular, preciso da quilometragem (km).`
            );
            break;
          }
        }

        const newIncome = new Income({
          userId: effectiveUserId,
          amount,
          description,
          category,
          source,
          distance,
          profileType: activeProfile,
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
      case "get_period_report": {
        const { period, month, monthName } = interpretation.data;
        const reportOptions = { period, month, monthName, activeProfile };
        if (!period && !month) { reportOptions.period = "week"; }
        const reportData = await getPeriodReport(effectiveUserId, reportOptions);
        sendPeriodReportMessage(twiml, reportData, activeProfile);
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
          const reportData = await getIncomesBySource(effectiveUserId, currentMonth, null, activeProfile);

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
        const expenses = await getExpensesByCategory(effectiveUserId, month, category, activeProfile);
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
          activeProfile: activeProfile,
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
        const incomes = await getIncomesBySource(effectiveUserId, month, source, activeProfile);

        const config = PROFILE_CONFIG[activeProfile];
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
          activeProfile: activeProfile,
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

        const { month, monthName, category, source, activeProfile: profileFromState } = previousData;
        const detailsMessage = type === "income"
            ? await getIncomeDetails(effectiveUserId, month, monthName, source, profileFromState)
            : await getExpenseDetails(effectiveUserId, month, monthName, category, profileFromState);

        await sendChunkedMessage(userId, detailsMessage);

        delete conversationState[effectiveUserId];

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
        sendGreetingMessage(twiml, { activeProfile: activeProfile });
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
        sendHelpMessage(twiml, { activeProfile: activeProfile });
        break;
      }
      default:
        sendHelpMessage(twiml, { activeProfile: activeProfile });
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
