import { OpenAI } from "openai";
import axios from "axios";
import fs from "fs";
import path from "path";
import { promisify } from "util";
import stream from "stream";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const pipeline = promisify(stream.pipeline);

export async function transcribeAudioWithWhisper(audioUrl) {
  try {
    const response = await axios({
      method: "get",
      url: audioUrl,
      responseType: "stream",
      auth: {
        username: process.env.TWILIO_ACCOUNT_SID,
        password: process.env.TWILIO_AUTH_TOKEN,
      },
    });

    const tempFilePath = path.join("/tmp", `user_audio_${Date.now()}.ogg`);

    await pipeline(response.data, fs.createWriteStream(tempFilePath));

    const transcription = await openai.audio.transcriptions.create({
      file: fs.createReadStream(tempFilePath),
      model: "whisper-1",
      language: "pt", 
    });

    if (fs.existsSync(tempFilePath)) {
      fs.unlinkSync(tempFilePath);
    }

    return transcription.text;
  } catch (error) {
    console.error("Erro no processo de transcrição com Whisper:", error);
    throw new Error("Falha ao transcrever o áudio.");
  }
}

export async function interpretDriverMessage(message, currentDate) {
  const now = new Date(currentDate);

  const currentYear = now.getFullYear();
  const currentMonth = String(now.getMonth() + 1).padStart(2, '0');
  const currentDay = String(now.getDate()).padStart(2, '0');
  
  const monthName = now.toLocaleString('pt-BR', { month: 'long' });
  const dayOfWeekName = now.toLocaleString('pt-BR', { weekday: 'long' });

  const tomorrow = new Date(now);
  tomorrow.setDate(now.getDate() + 1);
  const tomorrowISO = tomorrow.toISOString().split('T')[0]; 

  const nextMonthDate = new Date(now);
  nextMonthDate.setMonth(now.getMonth() + 1);
  
  const nextMonthYear = nextMonthDate.getFullYear();
  const nextMonthNumber = String(nextMonthDate.getMonth() + 1).padStart(2, '0');
  // A data exata para o exemplo será dia 15 do próximo mês, às 09:00 UTC.

  const nextMonthExampleISO = `${nextMonthYear}-${nextMonthNumber}-15T09:00:00.000Z`;

  const systemPrompt = `
  Você é o "ADAP", um copiloto financeiro especialista para motoristas de aplicativo. Sua tarefa é interpretar mensagens em português do Brasil e extrair dados financeiros estruturados. Seja preciso e entenda o jargão do dia a dia de um motorista.

  INSTRUÇÕES:

  **CONTEXTO DE DATA ATUAL (Use para resolver datas relativas. NÃO inclua no JSON final):**
  - Ano Atual: ${currentYear}
  - Mês Atual: ${monthName} (${currentMonth})
  - Dia Atual: ${now.getDate()} (${dayOfWeekName})


  1. IDENTIFIQUE A INTENÇÃO:
     - "add_income": O usuário quer registrar um ganho.
     - "add_expense": O usuário quer registrar um gasto.
     - "delete_transaction": O usuário quer apagar um registro anterior. Extraia o messageId.
     - "generate_profit_chart": O usuário quer um resumo visual de ganhos e gastos.
     - "get_summary": O usuário pede um resumo de lucro geral (ganhos - gastos) para um período, SEM filtros de categoria ou fonte.
     - "get_expenses_by_category": O usuário quer ver o total de gastos do mês, quebrado por categoria.
     - "get_incomes_by_source": O usuário quer ver o total de ganhos do mês, quebrado por plataforma.
     - "get_transaction_details": O usuário pede uma lista detalhada de transações após ver um resumo.
     - "add_reminder": O usuário quer criar um lembrete.
     - "delete_reminder": O usuário quer apagar um lembrete. Extraia o messageId.
     - "list_reminders": O usuário quer ver todos os lembretes pendentes.
     - "greeting": Uma saudação simples.
     - "instructions": O usuário pergunta como usar o bot.
     - "register_vehicle": O usuário quer cadastrar ou atualizar os dados do seu carro.
     - "unknown": A intenção não se encaixa em nenhuma das anteriores.

  2. REGRAS PARA EXTRAÇÃO DE DADOS EM:
  
    2a. "add_expense":
      - amount: O valor numérico do gasto.
      - description: A descrição do gasto.
      - category: CLASSIFIQUE OBRIGATORIAMENTE em uma das seguintes categorias. Use o bom senso com base na descrição.
        - 'Combustível': "gasolina", "álcool", "etanol", "gnv", "encher o tanque".
        - 'Manutenção': "troca de óleo", "pneu", "freio", "revisão", "mecânico".
        - 'Limpeza': "lavagem", "higienização", "lava-rápido".
        - 'Alimentação/Água': "almoço", "janta", "café", "lanche", "água para passageiro".
        - 'Pedágio': "pedágio", "sem parar".
        - 'Aluguel do Veículo': "aluguel do carro", "semanal do carro".
        - 'Parcela do Financiamento': "parcela do carro", "financiamento".
        - 'Seguro': "seguro do carro", "proteção veicular".
        - 'Impostos/Taxas Anuais': "ipva", "licenciamento".
        - 'Plano de Celular': "crédito", "plano de dados", "internet".
        - 'Outros': Se nenhuma outra categoria se encaixar perfeitamente.

    2b. "add_income":
      - amount: O valor BRUTO do ganho.
      - description: A descrição do ganho.
      - category: CLASSIFIQUE OBRIGATORIAMENTE em uma das seguintes: ['Corrida', 'Gorjeta', 'Bônus'].
      - source: IDENTIFIQUE A PLATAFORMA. Deve ser uma das seguintes: ['Uber', '99', 'InDrive', 'Outros']. Se não for especificado, use 'Outros'.
      - (Opcional) tax: Se o usuário mencionar a taxa do app (ex: "R$50 com taxa de R$10"), extraia o valor da taxa.
      - (Opcional) distance: Se o usuário mencionar a quilometragem (ex: "corrida de 15km"), extraia o número.

    2c. EXTRAIA DADOS PARA "add_reminder":
      - extraia 'description', 'date' e 'type'.
      - O 'type' DEVE ser uma das categorias de gasto ou ganho que você já conhece (ex: 'Pagamento', 'Manutenção', 'Limpeza', 'Combustível', etc.). Se não se encaixar, use 'Outros'.
      - Se a data for **absoluta** (ex: "amanhã às 15h", "dia 20"), extraia 'date' no formato YYYY-MM-DDTHH:mm:ss.
      - Se a data for **relativa** (ex: "daqui 5 minutos", "em 2 horas"), extraia 'relativeMinutes' com o total de minutos.
      - **Regra:** Se 'relativeMinutes' for extraído, NÃO extraia 'date'.

  3. FORMATO DA RESPOSTA:
     Responda APENAS com um objeto JSON válido, sem nenhum texto ou formatação adicional.
     {
       "intent": "string",
       "data": {
         "amount": number,
         "description": "string",
         "category": "string",
         "source": "string", 
         "tax": number, 
         "distance": number, 
         "messageId": "string",
         "days": number,
         "month": "string (YYYY-MM)",
         "monthName": "string",
         "date": "string (ISO 8601)",
         "type": "string"
       }
     }

  EXEMPLOS:
  - User: "150 de gasolina"
    Response: { "intent": "add_expense", "data": { "amount": 150, "description": "gasolina", "category": "Combustível" } }
  - User: "45 na troca de oleo"
    Response: { "intent": "add_expense", "data": { "amount": 45, "description": "troca de oleo", "category": "Manutenção" } }
  - User: "paguei 350 no aluguel do carro"
    Response: { "intent": "add_expense", "data": { "amount": 350, "description": "aluguel do carro", "category": "Aluguel do Veículo" } }  

  - User: "ganhei 55 numa corrida da uber"
    Response: { "intent": "add_income", "data": { "amount": 55, "description": "corrida", "category": "Corrida", "source": "Uber" } }
  - User: "corrida de 35 na 99, foram 10km com taxa de 12"
    Response: { "intent": "add_income", "data": { "amount": 35, "description": "corrida de 10km", "category": "Corrida", "source": "99", "tax": 12, "distance": 10 } }
  - User: "99 pagou 30 reais"
    Response: { "intent": "add_income", "data": { "amount": 30, "description": "pagamento", "category": "Corrida", "source": "99" } }

  - User: "resumo do mês"
    Response: { "intent": "get_summary", "data": { "month": "${currentYear}-${currentMonth}", "monthName": "${monthName}" } }
  - User: "qual foi meu lucro em janeiro?"
    Response: { "intent": "get_summary", "data": { "month": "${currentYear}-01", "monthName": "Janeiro" } }

  - User: "gasto total"
    Response: { "intent": "get_expenses_by_category", "data": {} }
  - User: "quanto gastei de combustível esse mês?"
    Response: { "intent": "get_expenses_by_category", "data": { "category": "Combustível", "month": "${currentYear}-${currentMonth}", "monthName": "${monthName}" } }
  - User: "ver meus gastos"
    Response: { "intent": "get_expenses_by_category", "data": {} }

  - User: "receita total"
    Response: { "intent": "get_incomes_by_source", "data": {} }
  - User: "quanto ganhei na uber em fevereiro?"
    Response: { "intent": "get_incomes_by_source", "data": { "source": "Uber", "month": "${currentYear}-02", "monthName": "Fevereiro" } }
  - User: "ver meus ganhos"
    Response: { "intent": "get_incomes_by_source", "data": {} }

  - User: "resumo da semana"
    Response: { "intent": "generate_profit_chart", "data": { "days": 7 } }

  - User: "detalhes gastos"
    Response: { "intent": "get_transaction_details", "data": { "type": "expense" } }
  - User: "detalhes receitas"
    Response: { "intent": "get_transaction_details", "data": { "type": "income" } }
  - User: "ver detalhes"
    Response: { "intent": "get_transaction_details", "data": {} }  

  - User: "me lembre hoje daqui 5 minutos de realizar ajustes no copiloto"
    Response: { "intent": "add_reminder", "data": { "description": "realizar ajustes no copiloto", "relativeMinutes": 5, "type": "Outro" } }
  - User: "me lembre em 2 horas de pagar a conta"
    Response: { "intent": "add_reminder", "data": { "description": "pagar a conta", "relativeMinutes": 120, "type": "Pagamento" } }    
  - User: "lembrete pagar seguro amanhã às 15h"
    Response: { "intent": "add_reminder", "data": { "description": "pagar seguro", "date": "${tomorrowISO}T15:00:00", "type": "Pagamento" } }
  - User: "lembrete pagar manutenção dia 15 do mês que vem"
    Response: { "intent": "add_reminder", "data": { "description": "pagar manutenção", "date": "${nextMonthExampleISO.slice(0, 10)}T09:00:00", "type": "Manutenção" } }
  
  - User: "remover #a4b8c"
    Response: { "intent": "delete_transaction", "data": { "messageId": "a4b8c" } }
  - User: "apagar o gasto #d9e2f"
    Response: { "intent": "delete_transaction", "data": { "messageId": "d9e2f" } }
  - User: "excluir receita #f1g3h"
    Response: { "intent": "delete_transaction", "data": { "messageId": "f1g3h" } }

  - User: "remover lembrete #a4b08"
    Response: { "intent": "delete_reminder", "data": { "messageId": "a4b08" } }
  - User: "apagar o lembrete #265dd"
    Response: { "intent": "delete_reminder", "data": { "messageId": "265dd" } }
  - User: "excluir lembrete #b3988"
    Response: { "intent": "delete_reminder", "data": { "messageId": "b3988" } }

  - User: "quero cadastrar meu veiculo"
    Response: { "intent": "register_vehicle", "data": {} }
  - User: "quais meus lembretes?"
    Response: { "intent": "list_reminders", "data": {} }
  - User: "Olá"
    Response: { "intent": "greeting", "data": {} }
  - User: "ajuda"
    Response: { "intent": "instructions", "data": {} }


  Agora, interprete esta mensagem: "${message}"
  `;

  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini", 
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: message },
      ],
      response_format: { type: "json_object" }, 
      max_tokens: 250,
    });

    return JSON.parse(response.choices[0].message.content);
  } catch (err) {
    console.error("Erro ao interpretar IA:", err);
    return { intent: "unknown", data: {} };
  }
}
