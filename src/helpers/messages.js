import { OpenAI } from "openai";
import { PROFILE_CONFIG } from '../utils/categories.js';
import { sendOrLogMessage } from "./responseHelper.js";
import { TIMEZONE } from "../utils/dateUtils.js";
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export function sendGreetingMessage(twiml, userStats) {
  sendHelpMessage(twiml, userStats);
}

export function sendHelpMessage(twiml, userStats) {
  const activeProfile = userStats.activeProfile || 'driver';
  const config = PROFILE_CONFIG[activeProfile];

  let message = `👋 Olá! Sou o *ADAP*, seu Copiloto Financeiro. Comandos para seu perfil de ${config.name} ${config.emoji}:

*🏁 GERENCIAR TURNO (NOVO!):*
› \`iniciar turno [km inicial]\`
› \`encerrar turno [km final]\`

*💸 LANÇAMENTOS:*
› \`${config.expenseExample}\`
› \`ganhei 50 numa corrida particular de 15km\`
› \`vendi um produto por 20 reais\`

*🗓️ LEMBRETES & METAS:*
› \`meta de hoje 300\` _(durante o turno)_
› \`lembrete turno 8h\` _(lembrete diário)_
› \`lembrete pagar ${config.vehicleName} amanhã 10h\`
› \`me lembre de fazer manutenção em 3 dias\`

*📊 RELATÓRIOS:*
› \`resumo da semana\`
› \`meus gastos\`
› \`gráfico das plataformas\`

*OUTROS:*
› \`mudar para [motorista/motoboy/zev]\`
› \`meu ${config.vehicleName}\`

Para apagar, use o ID do registro. Ex: \`apagar #a4b8c\``;

  sendOrLogMessage(twiml, message);
}

export function sendIncomeAddedMessage(twiml, incomeData) {
  const { amount, description, source, distance, messageId, count } = incomeData;

  let message = `💰 *Ganho de R$ ${amount.toFixed(2)} anotado!*`;
  message += `\n📃 *Descrição:* ${description.charAt(0).toUpperCase() + description.slice(1)}`;
  if (source && source !== 'Outros') {
    message += `\n📱 *Plataforma:* ${source}`;
  }

  if (distance && distance > 0) {
    message += `\n🛣️ *Distância:* ${distance} km`;
  }
  
  if (count && count > 0) {
      message += `\n*Corridas/Entregas:* ${count}`;
  }
  message += `\n\n🆔 para exclusão: _#${messageId}_`;

  sendOrLogMessage(twiml, message);
}

export function sendExpenseAddedMessage(twiml, expenseData) {
  const { amount, description, category, messageId, kwh } = expenseData;
  let message = `💸 *Gasto anotado!*
📌 ${description.charAt(0).toUpperCase() + description.slice(1)} (_${category}_)
❌ *R$ ${amount.toFixed(2)}*`;

  if (kwh && kwh > 0) {
    message += `\n⚡️ *Recarga:* ${kwh} kWh`;
  }
  message += `\n🆔 #${messageId}`;
  sendOrLogMessage(twiml, message);
}

export function sendIncomeDeletedMessage(twiml, incomeData) {
  sendOrLogMessage(twiml, `🗑️ Ganho _#${incomeData.messageId}_ removido.`);
}

export function sendExpenseDeletedMessage(twiml, expenseData) {
  sendOrLogMessage(twiml, `🗑️ Gasto _#${expenseData.messageId}_ removido.`);
}

export async function sendReminderMessage(twiml, reminderData) {
  const typeEmoji = {
    Pagamento: "💳",
    Manutenção: "🔧",
    Documento: "📄",
    Outro: "🗓️",
  };

  const dateObj = new Date(reminderData.date);

  const formattedDateTime = dateObj.toLocaleString("pt-BR", {
    timeZone: TIMEZONE,
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

  sendOrLogMessage(twiml,
    `*Lembrete agendado!* ✅\n` +
      `${typeEmoji[reminderData.type] || "🗓️"} *${reminderData.type}:* ${
        reminderData.description
      }\n` +
      `📅 *Data:* ${formattedDateTime}\n` +
      `🆔 #${reminderData.messageId}`
  );
}

export function sendReminderDeletedMessage(twiml, reminderData) {
  sendOrLogMessage(twiml, `🗑️ Lembrete _#${reminderData.messageId}_ removido.`);
}

export function sendTotalRemindersMessage(twiml, allFutureReminders) {
  if (!allFutureReminders || allFutureReminders.length === 0) {
    sendOrLogMessage(twiml, "Você não tem nenhum lembrete futuro agendado. 👍");
    return;
  }
  sendOrLogMessage(twiml,
    `Aqui estão seus próximos lembretes:\n\n${allFutureReminders}\n\nPara apagar um, digite "apagar lembrete #id".`
  );
}

export function sendPeriodReportMessage(twiml, reportData, activeProfile) {
  if (reportData.incomeCount === 0 && reportData.expenseCount === 0) {
    sendOrLogMessage(twiml, `Você ainda não tem nenhum registro para o período selecionado (${reportData.title}).`);
    return;
  }
  
  const config = PROFILE_CONFIG[activeProfile];
  const title = reportData.title;
  const profitEmoji = reportData.profit >= 0 ? "✅" : "❌";
  const incomeLabel = (activeProfile === 'motoboy') ? 'Entregas/Corridas' : 'Corridas';

  let message = `📊 *Resumo ${title}* (${config.name})\n\n`;

  message += `*Ganhos* 💰\n`;
  message += `› *Total:* R$ ${reportData.totalIncome.toFixed(2)}\n`;
  if (reportData.racesCount > 0) {
    message += `› *${incomeLabel}:* ${reportData.racesCount}\n`;
  }
  message += `› *Registros Avulsos:* ${reportData.incomeCount - reportData.turnIncomeCount}\n\n`;

  message += `*Gastos* 💸\n`;
  message += `› *Total:* R$ ${reportData.totalExpenses.toFixed(2)}\n`;
  message += `› *Registros:* ${reportData.expenseCount}\n\n`;

  message += `----------\n`;
  message += `${profitEmoji} *Lucro:* R$ ${reportData.profit.toFixed(2)}`;

  sendOrLogMessage(twiml, message);
}

export async function sendFinancialHelpMessage(twiml, message) {
  const prompt = `Você é o ADAP, um co-piloto financeiro. Responda à seguinte pergunta de um motorista de aplicativo de forma clara, direta e útil, em português do Brasil: "${message}"`;
  const response = await openai.chat.completions.create({
    model: "gpt-4",
    messages: [{ role: "system", content: prompt }],
    max_tokens: 300,
  });
  sendOrLogMessage(twiml, response.choices[0].message.content);
}
