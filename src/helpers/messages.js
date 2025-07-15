import { OpenAI } from "openai";
import { sendOrLogMessage } from "./responseHelper.js";
import { TIMEZONE } from "../utils/dateUtils.js";
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export function sendGreetingMessage(twiml) {
  sendHelpMessage(twiml);
}
export function sendHelpMessage(twiml) {
  sendOrLogMessage(twiml,
    `👋 Olá! Sou o *ADAP, seu Copiloto Financeiro*.

Estou aqui para te ajudar a saber se suas corridas estão dando lucro de verdade, de um jeito fácil e direto no WhatsApp.

1️⃣ *PRIMEIRO PASSO: CADASTRE SEU CARRO*
Para começar, me diga: *"cadastrar meu carro"*
Você também pode ver os dados do seu carro com: *"meu carro"*

*O QUE VOCÊ PODE FAZER:*

⛽ *Lançar Gastos:*
   - "150 de gasolina"
   - "45 na troca de óleo"

💰 *Lançar Ganhos:*
   - "ganhei 55 na uber em 15km"
   - "10 de gorjeta"

📊 *Ver Relatórios e Gráficos:*
   - "resumo de hoje" (ou "semana"/"mês" atual)
   - "gráfico de ganhos" ou "pizza de plataformas"
   - "meus gastos" (detalhes por categoria e itens)
   - "meus ganhos" (detalhes por plataforma)

🗓️ *Criar Lembretes:*
   - "me lembre de pagar o seguro dia 20 às 10h"
   - "me lembre em 2 horas de abastecer"

Para apagar um registro, use o ID fornecido. Ex: "apagar #a4b8c".

Vamos acelerar seu controle financeiro! 🚗💨`
  );
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
export function sendPeriodReportMessage(twiml, reportData) {
  if (reportData.incomeCount === 0 && reportData.expenseCount === 0) {
    sendOrLogMessage(twiml, `Você ainda não tem nenhum registro para o período selecionado. Comece adicionando um ganho ou gasto!`);
    return;
  }
  
  const title = reportData.title;
  const rPerKm = reportData.totalDistance > 0 ? (reportData.totalIncome / reportData.totalDistance).toFixed(2) : '0.00';
  const profitEmoji = reportData.profit >= 0 ? "✅" : "❌";

  // =================== INÍCIO DA LÓGICA DE CUSTOMIZAÇÃO ===================
  // Customiza os termos com base no perfil
  const incomeLabel = activeProfile === 'motoboy' ? 'Entregas' : 'Corridas';
  const incomeMetricLabel = activeProfile === 'motoboy' ? 'R$/entrega' : 'R$/km Médio';
  
  // Calcula a métrica correta. Para motoboy, R$/entrega é mais relevante que R$/km
  const incomeMetricValue = activeProfile === 'motoboy'
    ? (reportData.incomeCount > 0 ? (reportData.totalIncome / reportData.incomeCount).toFixed(2) : '0.00')
    : rPerKm;

  // =================== FIM DA LÓGICA DE CUSTOMIZAÇÃO ===================

  let message = `📊 *Resumo ${title}*\n\n`; // Usa o título dinâmico

  message += `*Ganhos* 💰\n`;
  message += `› *Total:* R$ ${reportData.totalIncome.toFixed(2)}\n`;
  message += `› *Corridas:* ${reportData.incomeCount}\n`;
  message += `› *R$/km Médio:* R$ ${rPerKm}\n\n`;

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
