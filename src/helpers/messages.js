import { OpenAI } from "openai";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// MUDANÇA: Ambas as funções de ajuda agora têm a mesma mensagem, focada no motorista.
export function sendGreetingMessage(twiml) {
  sendHelpMessage(twiml);
}

export function sendHelpMessage(twiml) {
  twiml.message(`👋 Olá! Sou o ADAP, seu *Co-piloto Financeiro*.

Estou aqui para te ajudar a saber se suas corridas estão dando lucro de verdade, de um jeito fácil e direto no WhatsApp.

*O QUE VOCÊ PODE FAZER:*

⛽ *Lançar Gastos:*
   - "150 de gasolina"
   - "45 na troca de óleo"
   - "350 no aluguel do carro"

💰 *Lançar Ganhos (por plataforma):*
   - "ganhei 55 na uber"
   - "99 pagou 30 reais"
   - "10 de gorjeta"

📈 *Ver Resumos e Lucro:*
   - "resumo da semana"
   - "lucro do mês"
   - "quanto ganhei na 99 hoje?"

🗓️ *Criar Lembretes:*
   - "lembrar de pagar o seguro dia 20"
   - "lembrete trocar o óleo daqui 3 meses"

É só me mandar uma mensagem que eu anoto tudo na hora! Vamos acelerar seu controle financeiro! 🚗💨`);
}

// MUDANÇA: Agora informa a plataforma (source).
export function sendIncomeAddedMessage(twiml, incomeData) {
  let sourceText = incomeData.source !== 'Outros' ? ` da *${incomeData.source}*` : '';
  twiml.message(
    `💰 *Ganho anotado${sourceText}!*
📌 ${incomeData.description.charAt(0).toUpperCase() + incomeData.description.slice(1)}
✅ *R$ ${incomeData.amount.toFixed(2)}*
🆔 #${incomeData.messageId}`
  );
}

// MUDANÇA: Mensagem mais temática.
export function sendExpenseAddedMessage(twiml, expenseData) {
  twiml.message(
    `💸 *Gasto anotado!*
📌 ${expenseData.description.charAt(0).toUpperCase() + expenseData.description.slice(1)} (_${expenseData.category}_)
❌ *R$ ${expenseData.amount.toFixed(2)}*
🆔 #${expenseData.messageId}`
  );
}

export function sendIncomeDeletedMessage(twiml, incomeData) {
  twiml.message(`🗑️ Ganho _#${incomeData.messageId}_ removido.`);
}

export function sendExpenseDeletedMessage(twiml, expenseData) {
  twiml.message(`🗑️ Gasto _#${expenseData.messageId}_ removido.`);
}

// MUDANÇA: Estrutura mais clara e informativa para o lembrete.
export async function sendReminderMessage(twiml, message, reminderData) {
  const typeEmoji = {
    'Pagamento': '💳',
    'Manutenção': '🔧',
    'Documento': '📄',
    'Outro': '🗓️'
  };
  const dateObj = new Date(reminderData.reminderDate);
  const formattedDate = dateObj.toLocaleDateString("pt-BR", {timeZone: 'UTC'});

  twiml.message(
    `*Lembrete agendado!* ✅
${typeEmoji[reminderData.type] || '🗓️'} *${reminderData.type}:* ${reminderData.description}
📅 *Data:* ${formattedDate}
🆔 #${reminderData.messageId}`
  );
}

export function sendReminderDeletedMessage(twiml, reminderData) {
  twiml.message(`🗑️ Lembrete _#${reminderData.messageId}_ removido.`);
}

// MUDANÇA: Exibe os lembretes de forma mais limpa e informativa.
export function sendTotalRemindersMessage(twiml, allFutureReminders) {
    if (!allFutureReminders || allFutureReminders.length === 0) {
        twiml.message("Você não tem nenhum lembrete futuro agendado. 👍");
        return;
    }
  twiml.message(
    `Aqui estão seus próximos lembretes:\n\n${allFutureReminders}\n\nPara apagar um, digite "apagar lembrete #id".`
  );
}

// MUDANÇA: Mantida, mas com o tom do Co-piloto.
export async function sendFinancialHelpMessage(twiml, message) {
  const prompt = `Você é o ADAP, um co-piloto financeiro. Responda à seguinte pergunta de um motorista de aplicativo de forma clara, direta e útil, em português do Brasil: "${message}"`;
  const response = await openai.chat.completions.create({
    model: "gpt-4",
    messages: [{ role: "system", content: prompt }],
    max_tokens: 300,
  });
  twiml.message(response.choices[0].message.content);
}