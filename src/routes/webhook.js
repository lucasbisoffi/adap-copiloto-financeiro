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
import {
  interpretDriverMessage,
  interpretMotoboyMessage,
  transcribeAudioWithWhisper,
} from "../services/aiService.js";
import { generatePlatformChart } from "../services/chartService.js";
import { sendReportImage } from "../services/twilioService.js";
import {
  getPeriodSummary,
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
  let responseSent = false; // Flag para controlar o envio da resposta

  // Função helper para finalizar a requisição HTTP
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
        sendOrLogMessage(twiml, "Ok, operação cancelada. 👍");
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

    //novo
    if (currentState && (currentState.flow === "vehicle_registration" || currentState.flow === "motorcycle_registration")) {
      const isMotorcycle = currentState.flow === "motorcycle_registration";
      const vehicleType = isMotorcycle ? "moto" : "carro";
      const vehicleEmoji = isMotorcycle ? "🏍️" : "🚗";
      
      devLog(`Fluxo de Cadastro de ${vehicleType} - Passo: ${currentState.step}`);

      // Validação de áudio permanece a mesma
      if (req.body.MediaUrl0 && req.body.MediaContentType0.includes("audio")) {
        sendOrLogMessage(twiml, `✋ Para garantir a precisão dos dados, o cadastro da sua ${vehicleType} deve ser feito *apenas por texto*.\n\nPor favor, digite sua resposta.`);
        finalizeResponse();
        return;
      }

      const flowMessage = messageToProcess.trim();
      const isConfirmation = ["sim", "s"].includes(flowMessage.toLowerCase());

      switch (currentState.step) {
        case "awaiting_brand":
          currentState.tempData = flowMessage;
          currentState.step = "confirming_brand";
          sendOrLogMessage(twiml, `Você digitou: "*${flowMessage}*"\n\nEstá correto? Responda "*sim*" para confirmar, ou envie a marca novamente.`);
          break;

        case "confirming_brand":
          if (isConfirmation) {
            currentState.brand = currentState.tempData;
            delete currentState.tempData;
            currentState.step = "awaiting_model";
            const modelExample = isMotorcycle ? "(Ex: CG 160, Fazer 250)" : "(Ex: Onix, Argo)";
            sendOrLogMessage(twiml, `✅ Marca confirmada!\n\nAgora, qual o *modelo* da sua ${vehicleType}? ${modelExample}`);
          } else {
            currentState.tempData = flowMessage;
            sendOrLogMessage(twiml, `Ok, entendi: "*${flowMessage}*"\n\nCorreto? (Responda "*sim*" ou envie novamente)`);
          }
          break;

        case "awaiting_model":
          currentState.tempData = flowMessage;
          currentState.step = "confirming_model";
          sendOrLogMessage(twiml, `Modelo: "*${flowMessage}*"\n\nEstá correto? (Responda "*sim*" ou envie novamente)`);
          break;

        case "confirming_model":
          if (isConfirmation) {
            currentState.model = currentState.tempData;
            delete currentState.tempData;
            currentState.step = "awaiting_year";
            sendOrLogMessage(twiml, `✅ Modelo confirmado!\n\nQual o *ano* da sua ${vehicleType}? (Ex: 2022)`);
          } else {
            currentState.tempData = flowMessage;
            sendOrLogMessage(twiml, `Ok, entendi: "*${flowMessage}*"\n\nCorreto? (Responda "*sim*" ou envie novamente)`);
          }
          break;
        
        case "awaiting_year":
          const currentYear = new Date().getFullYear();
          const inputYear = parseInt(flowMessage);
          if (
            isNaN(parseInt(flowMessage)) ||
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
            const currentYear = new Date().getFullYear();
            const inputYear = parseInt(vehicleFlowMessage);
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

            if (isMotorcycle) {
              // Salva uma MOTO
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
                { $set: { activeMotorcycleId: newMotorcycle._id } }
              );
            } else {
              // Salva um CARRO
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
                { $set: { activeVehicleId: newVehicle._id } }
              );
            }

            sendOrLogMessage(twiml, `${vehicleEmoji} Prontinho! Sua *${currentState.brand} ${currentState.model}* foi cadastrada com sucesso.`);
            delete conversationState[userId];

          } else {
            // A lógica de "else" para reconfirmar a quilometragem é a mesma
            const newMileage = flowMessage.replace(/\D/g, "");
            if (isNaN(parseInt(newMileage))) {
              sendOrLogMessage(twiml, "Este valor também parece inválido. Por favor, envie apenas os números (ex: 85000).");
            } else {
              currentState.tempData = parseInt(newMileage);
              sendOrLogMessage(twiml, `Ok, entendi: *${newMileage} KM*\n\nCorreto? (Responda "*sim*" para finalizar)`);
            }
          }
          break;
        
        default:
          sendOrLogMessage(
            twiml,
            "Hmm, não entendi sua resposta. Você está no meio do cadastro do veículo. Digite 'cancelar' para sair ou responda à última pergunta."
          );
          break;
      }
      res.writeHead(200, { "Content-Type": "text/xml" });
      return res.end(twiml.toString());
    }

    let userStats = await UserStats.findOne({ userId });

    if (userStats?.blocked) {
      sendOrLogMessage(twiml, "🚫 Você está bloqueado de usar a ADAP.");
      res.writeHead(200, { "Content-Type": "text/xml" });
      return res.end(twiml.toString());
    }

    // =================== INÍCIO DO NOVO BLOCO DE ONBOARDING ===================
    // Cenário 1: Usuário completamente novo, nunca interagiu com o bot.
    if (!userStats) {
      conversationState[userId] = { flow: 'onboarding_v2' };
      const welcomeMsg = "👋 Bem-vindo(a) ao ADAP! Para começar, me diga sua principal ferramenta de trabalho:\n\n*1* - Carro 🚗 (Motorista)\n*2* - Moto 🏍️ (Entregador)";
      sendOrLogMessage(twiml, welcomeMsg);
      finalizeResponse();
      return; // Encerra o fluxo aqui, aguardando a resposta do usuário.
    }

    // Gerenciador do fluxo de onboarding: processa a resposta "1" ou "2".
    if (conversationState[userId]?.flow === 'onboarding_v2') {
        const choice = messageToProcess.trim();
        let profileType = choice === '1' ? 'driver' : (choice === '2' ? 'motoboy' : null);

        if (profileType) {
            userStats = await UserStats.create({
                userId,
                profiles: { [profileType]: true, [profileType === 'driver' ? 'motoboy' : 'driver']: false },
                activeProfile: profileType,
                welcomedToV2: true, // Já viu as boas-vindas ao se cadastrar.
            });
            delete conversationState[userId];

            // Envia a mensagem de ajuda personalizada para o perfil criado.
            sendHelpMessage(twiml, profileType); // Você precisará adaptar a sendHelpMessage para aceitar o perfil
        } else {
            sendOrLogMessage(twiml, "Opção inválida. Por favor, responda apenas com o número *1* para Carro ou *2* para Moto.");
        }
        finalizeResponse();
        return; // Encerra o fluxo aqui.
    }

    // Cenário 2: Usuário antigo que precisa ver a mensagem de boas-vindas da V2
    if (!userStats.welcomedToV2) {
        const updateMessage = "🎉 *Novidade no ADAP!* 🎉\n\nAgora o seu copiloto também ajuda *entregadores de moto*!\n\nVocê pode adicionar um perfil de motoboy, ou trocar entre seus perfis a qualquer momento. Experimente dizer:\n\n› _\"adicionar perfil de moto\"_\n› _\"mudar para moto\"_";
        sendOrLogMessage(twiml, updateMessage);
        userStats.welcomedToV2 = true;
        await userStats.save();
        // Não usamos 'return' aqui para que a mensagem original dele seja processada logo em seguida.
    }
    // =================== FIM DO BLOCO DE ONBOARDING ===================

    const generateId = customAlphabet("1234567890abcdef", 5);
    const todayISO = new Date().toISOString();

    let interpretation;

    if (userStats && userStats.activeProfile === "motoboy") {
      interpretation = await interpretMotoboyMessage(
        messageToProcess,
        todayISO
      );
    } else {
      interpretation = await interpretDriverMessage(messageToProcess, todayISO);
    }
    devLog(
      `Intenção da IA para perfil '${userStats?.activeProfile || "driver"}':`,
      interpretation.intent
    );

    switch (interpretation.intent) {
      
      case "switch_profile": {
        const { profile } = interpretation.data; // A IA nos dará 'driver' ou 'motoboy'
        
        // A variável 'userStats' já foi buscada no início do webhook.
        if (userStats.profiles[profile]) {
          userStats.activeProfile = profile;
          await userStats.save();
          const profileName = profile === 'driver' ? 'Motorista 🚗' : 'Entregador 🏍️';
          sendOrLogMessage(twiml, `✅ Perfil alterado para *${profileName}*! Seus próximos lançamentos e relatórios serão para este perfil.`);
        } else {
          // O usuário tentou mudar para um perfil que não tem.
          const profileName = profile === 'driver' ? 'Motorista' : 'Entregador';
          sendOrLogMessage(twiml, `Você ainda não tem um perfil de ${profileName}. Diga *"adicionar perfil de ${profileName.toLowerCase()}"* para criar um.`);
        }
        break;
      }
      case "add_profile": {
        const { profile } = interpretation.data;
        
        if (userStats.profiles[profile]) {
          sendOrLogMessage(twiml, "Você já tem este perfil!");
          break;
        }

        if (profile === 'driver') {
          userStats.profiles.driver = true;
          await userStats.save();
          // Inicia o fluxo de cadastro de VEÍCULO
          conversationState[userId] = { flow: 'vehicle_registration', step: 'awaiting_brand' };
          sendOrLogMessage(twiml, "🚗 Ótimo! Para ativar seu perfil de motorista, vamos cadastrar seu carro.\n\nQual a *marca* do veículo?");
        
        } else { // profile === 'motoboy'
          userStats.profiles.motoboy = true;
          await userStats.save();
          // Inicia o fluxo de cadastro de MOTO
          conversationState[userId] = { flow: 'motorcycle_registration', step: 'awaiting_brand' };
          sendOrLogMessage(twiml, "🏍️ Perfil de Entregador adicionado! Para finalizar, vamos cadastrar sua moto.\n\nQual a *marca* dela?");
        }
        break;
      }
      case "get_vehicle_details": {
        const userStats = await UserStats.findOne({ userId }).populate(
          "activeVehicleId"
        );

        if (!userStats || !userStats.activeVehicleId) {
          sendOrLogMessage(
            twiml,
            "🚗 Você ainda não cadastrou um veículo. Digite *'cadastrar carro'* para começar."
          );
          break;
        }

        const vehicle = userStats.activeVehicleId;
        const vehicleMessage = `*Seu Veículo Ativo* 🚙\n\n*Marca:* ${
          vehicle.brand
        }\n*Modelo:* ${vehicle.model}\n*Ano:* ${
          vehicle.year
        }\n*KM Atual:* ${vehicle.currentMileage.toLocaleString("pt-BR")} km`;

        sendOrLogMessage(twiml, vehicleMessage);
        break;
      }
      case "get_motorcycle_details": {
        // Usamos populate para buscar os dados da moto referenciada
        const userWithMoto = await UserStats.findOne({ userId }).populate('activeMotorcycleId');

        if (!userWithMoto || !userWithMoto.activeMotorcycleId) {
          sendOrLogMessage(twiml, "🏍️ Você ainda não cadastrou uma moto. Diga *'adicionar perfil de moto'* para começar.");
          break;
        }

        const motorcycle = userWithMoto.activeMotorcycleId;
        const motorcycleMessage = `*Sua Moto Ativa* 🏍️\n\n*Marca:* ${motorcycle.brand}\n*Modelo:* ${motorcycle.model}\n*Ano:* ${motorcycle.year}\n*KM Atual:* ${motorcycle.currentMileage.toLocaleString("pt-BR")} km`;
        
        sendOrLogMessage(twiml, motorcycleMessage);
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
          sendOrLogMessage(
            twiml,
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
          profileType: userStats.activeProfile,
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
          profileType: userStats.activeProfile,
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
      case "get_period_report": {
        const { period, month } = interpretation.data;

        let reportData;
        if (!period && !month) {
          reportData = await getPeriodReport(userId, { period: "week", activeProfile: userStats.activeProfile });
        } else {
          reportData = await getPeriodReport(userId, { period, month, activeProfile: userStats.activeProfile });
        }

        sendPeriodReportMessage(twiml, reportData, userStats.activeProfile);
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
                userId, 
                currentMonth, 
                null, // `source` é null para pegar todas
                userStats.activeProfile // <-- ADICIONE ESTE PARÂMETRO
            );

          if (reportData.length === 0) {
            await sendChunkedMessage(
              userId,
              "Não encontrei nenhum ganho este mês para gerar o gráfico. 🤷‍♂️"
            );
            break;
          }

          devLog("Gerando a imagem e fazendo upload para o Cloudinary...");
          // A função agora retorna a URL do Cloudinary diretamente
          const imageUrl = await generatePlatformChart(reportData, userId);

          devLog(`Enviando imagem do gráfico via Cloudinary URL: ${imageUrl}`);
          await sendReportImage(
            userId,
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
        const expenses = await getExpensesByCategory(userId, month, category, userStats.activeProfile);
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
        // A função agora retorna os dados com contagem e distância!
        const incomes = await getIncomesBySource(userId, month, source, userStats.activeProfile);

        if (incomes.length === 0) {
          sendOrLogMessage(
            twiml,
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
          const detailsLine = `_${
            inc.count
          } corridas | ${inc.totalDistance.toFixed(
            1
          )} km | R$ ${averageRperKm.toFixed(2)} por km_`;

          message += `\n*${inc._id}: R$ ${inc.total.toFixed(
            2
          )}*\n${detailsLine}\n`;
        });

        message += `\n*Total Recebido:* R$ ${totalIncome.toFixed(2)}`;
        message += `\n\n_Digite "detalhes receitas" para ver a lista completa._`;

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

        // A. Envie uma mensagem de "aguarde" imediata
        sendOrLogMessage(
          twiml,
          "🧾 Ok! Gerando seu relatório detalhado, um momento..."
        );

        // B. Finalize a resposta HTTP para a Twilio AGORA
        finalizeResponse();

        // C. Continue o processamento pesado DEPOIS de responder
        const { month, monthName, category, source } = previousData;
        devLog(`Buscando detalhes para: Tipo=${type}, Mês=${month}`);

        const detailsMessage =
          type === "income"
            ? await getIncomeDetails(userId, month, monthName, source, userStats.activeProfile)
            : await getExpenseDetails(userId, month, monthName, category, userStats.activeProfile);

        // D. Chame nossa nova função para enviar o relatório (que pode ser longo)
        await sendChunkedMessage(userId, detailsMessage);

        delete conversationState[userId];

        // Já que a resposta foi enviada, não fazemos mais nada com `twiml` aqui.
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
