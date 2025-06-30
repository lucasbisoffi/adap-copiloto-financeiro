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
    // 1. Fazer o download do arquivo de áudio da URL fornecida pelo Twilio.
    const response = await axios({
      method: "get",
      url: audioUrl,
      responseType: "stream", // Importante para lidar com o arquivo como um fluxo de dados.
      // O Twilio protege o acesso à URL da mídia com autenticação.
      auth: {
        username: process.env.TWILIO_ACCOUNT_SID,
        password: process.env.TWILIO_AUTH_TOKEN,
      },
    });

    // 2. Definir um caminho temporário para salvar o áudio.
    const tempFilePath = path.join("/tmp", `user_audio_${Date.now()}.ogg`);

    // 3. Salvar o fluxo de áudio no arquivo temporário.
    await pipeline(response.data, fs.createWriteStream(tempFilePath));

    // 4. Enviar o arquivo salvo para a API do Whisper para transcrição.
    const transcription = await openai.audio.transcriptions.create({
      file: fs.createReadStream(tempFilePath),
      model: "whisper-1",
      language: "pt", // Especificar o idioma melhora a precisão.
    });

    // 5. Apagar o arquivo temporário após a transcrição para não ocupar espaço.
    if (fs.existsSync(tempFilePath)) {
      fs.unlinkSync(tempFilePath);
    }

    // 6. Retornar o texto puro da transcrição.
    return transcription.text;
  } catch (error) {
    console.error("Erro no processo de transcrição com Whisper:", error);
    throw new Error("Falha ao transcrever o áudio.");
  }
}

export async function interpretDriverMessage(message, currentDate) {
  // --- LÓGICA DE DATA DINÂMICA ---
  const now = new Date(currentDate);

  const currentYear = now.getFullYear();
  const currentMonth = String(now.getMonth() + 1).padStart(2, '0');
  const currentDay = String(now.getDate()).padStart(2, '0');
  
  const monthName = now.toLocaleString('pt-BR', { month: 'long' });
  const dayOfWeekName = now.toLocaleString('pt-BR', { weekday: 'long' });

  // Calcular "amanhã"
  const tomorrow = new Date(now);
  tomorrow.setDate(now.getDate() + 1);
  const tomorrowISO = tomorrow.toISOString().split('T')[0]; // Apenas a parte da data

  // --- INÍCIO DA MUDANÇA ---
  // Calcular "mês que vem" para os exemplos
  const nextMonthDate = new Date(now);
  nextMonthDate.setMonth(now.getMonth() + 1);
  
  const nextMonthYear = nextMonthDate.getFullYear();
  const nextMonthNumber = String(nextMonthDate.getMonth() + 1).padStart(2, '0');
  // A data exata para o exemplo será dia 15 do próximo mês, às 09:00 UTC.
  const nextMonthExampleISO = `${nextMonthYear}-${nextMonthNumber}-15T09:00:00.000Z`;

  const systemPrompt = `
  Você é o "ADAP", um co-piloto financeiro especialista para motoristas de aplicativo. Sua tarefa é interpretar mensagens em português do Brasil e extrair dados financeiros estruturados. Seja preciso e entenda o jargão do dia a dia de um motorista.

  INSTRUÇÕES:

  1. IDENTIFIQUE A INTENÇÃO:
     - "add_income": O usuário quer registrar um ganho (corrida, gorjeta, bônus).
     - "add_expense": O usuário quer registrar um gasto (combustível, manutenção, etc.).
     - "delete_transaction": O usuário quer apagar um registro anterior. Extraia o messageId.
     - "generate_profit_chart": O usuário quer um resumo visual de ganhos e gastos (ex: "resumo da semana", "gráfico do mês").
     - "get_summary": O usuário pede um resumo de lucro geral (ganhos - gastos) para um período, SEM filtros de categoria ou fonte (ex: "resumo do mês", "lucro de junho").
     - "get_expenses_by_category": O usuário quer ver o total de gastos do mês, quebrado por categoria (ex: "gasto total", "ver meus gastos").
     - "get_incomes_by_source": O usuário quer ver o total de ganhos do mês, quebrado por plataforma (ex: "receita total", "ver meus ganhos").
     - "get_transaction_details": O usuário pede uma lista detalhada de transações após ver um resumo (ex: "detalhes gastos", "ver detalhes", "detalhar receitas").
     - "add_reminder": O usuário quer criar um lembrete (ex: "lembrar de pagar o seguro dia 15", "trocar o óleo semana que vem").
     - "delete_reminder": O usuário quer apagar um lembrete. Extraia o messageId.
     - "list_reminders": O usuário quer ver todos os lembretes pendentes.
     - "greeting": Uma saudação simples (oi, olá, bom dia).
     - "instructions": O usuário pergunta como usar o bot.
     - "register_vehicle": O usuário quer cadastrar ou atualizar os dados do seu carro.
     - "unknown": A intenção não se encaixa em nenhuma das anteriores.

  2. EXTRAIA DADOS PARA "add_expense":
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

  3. EXTRAIA DADOS PARA "add_income":
     - amount: O valor BRUTO do ganho.
     - description: A descrição do ganho.
     - category: CLASSIFIQUE OBRIGATORIAMENTE em uma das seguintes: ['Corrida', 'Gorjeta', 'Bônus'].
     - source: IDENTIFIQUE A PLATAFORMA. Deve ser uma das seguintes: ['Uber', '99', 'InDrive', 'Outros']. Se não for especificado, use 'Outros'.
     - (Opcional) tax: Se o usuário mencionar a taxa do app (ex: "R$50 com taxa de R$10"), extraia o valor da taxa.
     - (Opcional) distance: Se o usuário mencionar a quilometragem (ex: "corrida de 15km"), extraia o número.

  4. EXTRAIA DADOS PARA "add_reminder":
     - description: O que é o lembrete.
     - reminderDate: A data E HORA futuras no formato ISO 8601 (YYYY-MM-DDTHH:mm:ss.sssZ). A data de hoje é ${currentDate}. Interprete "amanhã às 14h", "hoje às 19:30", etc. Se a hora não for especificada, use 09:00 como padrão.
     - type: CLASSIFIQUE OBRIGATORIAMENTE em um dos seguintes: ['Pagamento', 'Manutenção', 'Documento', 'Outro'].

  5. FORMATO DA RESPOSTA:
     Responda APENAS com um objeto JSON válido, sem nenhum texto ou formatação adicional.
     {
       "intent": "string",
       "data": {
         "amount": number,
         "description": "string",
         "category": "string",
         "source": "string", // Apenas para income
         "tax": number, // Opcional para income
         "distance": number, // Opcional para income
         "messageId": "string",
         "days": number,
         "month": "string (YYYY-MM)",
         "monthName": "string",
         "reminderDate": "string (ISO 8601)",
         "type": "string" // Apenas para reminder
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

  // --- Exemplos de Lembretes (com data e hora) ---
  - User: "lembrete pagar o seguro do carro dia 15 deste mês"
    Response: { "intent": "add_reminder", "data": { "description": "pagar o seguro do carro", "date": "${currentYear}-${currentMonth}-15T09:00:00.000Z" } }
  - User: "me lembre de pagar a manutenção do carro dia 15 do mês que vem"
    Response: { "intent": "add_reminder", "data": { "description": "pagar a manutenção do carro", "date": "${nextMonthExampleISO}", "type": "Manutenção" } }
  - User: "lembrete trocar o óleo amanhã às 15h"
    Response: { "intent": "add_reminder", "data": { "description": "trocar o óleo", "date": "${tomorrowISO.replace('T00:00:00.000Z', 'T15:00:00.000Z')}" } }

  // --- Exemplos de Comandos Gerais ---
  - User: "quero cadastrar meu veiculo"
    Response: { "intent": "register_vehicle", "data": {} }
  - User: "remover #a4b8c"
    Response: { "intent": "delete_transaction", "data": { "messageId": "a4b8c" } }
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
