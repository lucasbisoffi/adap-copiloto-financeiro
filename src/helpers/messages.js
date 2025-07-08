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
Isso é essencial para futuros relatórios de desempenho!

*DEPOIS, VOCÊ PODE:*

⛽ *Lançar Gastos:*
   - "150 de gasolina"
   - "45 na troca de óleo"
   - "paguei 350 no aluguel do carro"

💰 *Lançar Ganhos (com KM):*
   - "ganhei 55 na uber em 15km"
   - "99 pagou 30 reais por uma corrida de 8km"
   - "10 de gorjeta" (não precisa de km)

📈 *Ver Resumos e Lucro:*
   - "resumo da semana" (gera um gráfico 📊)
   - "lucro do mês"
   - "quanto ganhei na 99?"
   - "ver meus gastos"

🗓️ *Criar Lembretes:*
   - "lembrete pagar seguro dia 20 às 10h"
   - "me lembre em 2 horas de abastecer"

É só me mandar uma mensagem que eu anoto tudo na hora! Vamos acelerar seu controle financeiro! 🚗💨`
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
export async function sendFinancialHelpMessage(twiml, message) {
  const prompt = `Você é o ADAP, um co-piloto financeiro. Responda à seguinte pergunta de um motorista de aplicativo de forma clara, direta e útil, em português do Brasil: "${message}"`;
  const response = await openai.chat.completions.create({
    model: "gpt-4",
    messages: [{ role: "system", content: prompt }],
    max_tokens: 300,
  });
  sendOrLogMessage(twiml, response.choices[0].message.content);
}
