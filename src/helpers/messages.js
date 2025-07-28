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

  let message = `👋 Olá! Sou o *ADAP*, seu Copiloto Financeiro para *${config.name}s*.

Aqui estão alguns exemplos para o seu perfil ${config.emoji}:

*Para começar:*
› "cadastrar ${config.pronomePossessivo} ${config.vehicleName}"
› "ver dados d${config.artigoDefinido} ${config.vehicleName}"

*Lançamentos:*
› "${config.expenseExample}"
› "${config.incomeExample}"

*Relatórios:*
› "resumo da semana"
› "meus gastos"
› "meus ganhos"
› "gráfico das plataformas"

*Lembretes:*
› "me lembre de pagar o seguro d${config.artigoDefinido} ${config.vehicleName}"`;

  // =================== INSTRUÇÃO EXCLUSIVA DA Z-EV ===================
  // Adiciona a seção de turnos apenas se o perfil for zev_driver
  if (activeProfile === 'zev_driver') {
    message += `

*Gerenciar Turnos:*
› "iniciar turno 10500 km"
› "encerrar turno 10650 km"`;
  }
  // =====================================================================

  message += `

*Alternar entre perfis:*
› "mudar para motorista", "mudar para motoboy", "mudar para motorista Z-EV"

Para apagar um registro, use o ID fornecido. Ex: "apagar #a4b8c".`;
  
  sendOrLogMessage(twiml, message);
}


export function sendIncomeAddedMessage(twiml, incomeData) {
  const { amount, description, source, distance, tax, messageId, category } = incomeData;

  let message = `💰 *Ganho de R$ ${amount.toFixed(2)} anotado!*`;

  message += `\n📃 *Descrição:* ${description.charAt(0).toUpperCase() + description.slice(1)}`;
  
  if (source && source !== 'Outros') {
    message += `\n📱 *Plataforma:* ${source}`;
  }

  if (category === 'Corrida') {
    message += `\n🛣️ *Distância:* ${distance} km`;

    if (tax) {
      message += `\n💸 *Taxa App:* R$ ${tax.toFixed(2)}`;
    }
  }

  message += `\n\n🆔 para exclusão: _#${messageId}_`;

  sendOrLogMessage(twiml,message);
}

export function sendExpenseAddedMessage(twiml, expenseData) {
  sendOrLogMessage(twiml,
    `💸 *Gasto anotado!*
📌 ${
      expenseData.description.charAt(0).toUpperCase() +
      expenseData.description.slice(1)
    } (_${expenseData.category}_)
❌ *R$ ${expenseData.amount.toFixed(2)}*
🆔 #${expenseData.messageId}`
  );
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
  
  const title = reportData.title;
  const rPerKm = reportData.totalDistance > 0 ? (reportData.totalIncome / reportData.totalDistance).toFixed(2) : '0.00';
  const profitEmoji = reportData.profit >= 0 ? "✅" : "❌";

  const incomeLabel = activeProfile === 'motoboy' ? 'Entregas' : 'Corridas';
  const incomeMetricLabel = activeProfile === 'motoboy' ? 'R$/entrega' : 'R$/km Médio';
  
  const incomeMetricValue = activeProfile === 'motoboy'
    ? (reportData.incomeCount > 0 ? (reportData.totalIncome / reportData.incomeCount).toFixed(2) : '0.00')
    : rPerKm;

  let message = `📊 *Resumo ${title}*\n\n`;

  message += `*Ganhos* 💰\n`;
  message += `› *Total:* R$ ${reportData.totalIncome.toFixed(2)}\n`;
  message += `› *${incomeLabel}:* ${reportData.incomeCount}\n`;
  message += `› *${incomeMetricLabel}:* R$ ${incomeMetricValue}\n\n`;

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
