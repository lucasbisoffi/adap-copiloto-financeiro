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

export async function interpretUserMessage(message, currentDate) {
  const now = new Date(currentDate);
  const currentYear = now.getFullYear();
  const currentMonth = String(now.getMonth() + 1).padStart(2, '0');
  const monthName = now.toLocaleString('pt-BR', { month: 'long' });
  const dayOfWeekName = now.toLocaleString('pt-BR', { weekday: 'long' });
  const tomorrow = new Date(now);
  tomorrow.setDate(now.getDate() + 1);
  const tomorrowISO = tomorrow.toISOString().split('T')[0]; 
  const nextMonthDate = new Date(now);
  nextMonthDate.setMonth(now.getMonth() + 1);
  const nextMonthYear = nextMonthDate.getFullYear();
  const nextMonthNumber = String(nextMonthDate.getMonth() + 1).padStart(2, '0');
  const nextMonthExampleISO = `${nextMonthYear}-${nextMonthNumber}-15T09:00:00.000Z`;

  const systemPrompt = `
  Você é o "ADAP: Z-EV", um copiloto financeiro especialista para motoristas de carros elétricos. Sua tarefa é interpretar mensagens em português do Brasil e extrair dados financeiros estruturados em JSON. Seja preciso e entenda o jargão de um motorista da Z-EV.
  

  **CONTEXTO DE DATA ATUAL (Use para resolver datas relativas. NÃO inclua no JSON final):**
  - Ano Atual: ${currentYear}
  - Mês Atual: ${monthName} (${currentMonth})
  - Dia Atual: ${now.getDate()} (${dayOfWeekName})


  1. IDENTIFIQUE A INTENÇÃO:
    - "add_income": Registrar um ganho.
    - "add_expense": Registrar um gasto.
    - "delete_transaction": Apagar um registro anterior. Extraia o messageId.
    - "get_period_report": Pedido de resumo de lucro para um período.
    - "get_expenses_by_category": Ver o total de gastos do mês por categoria.
    - "get_incomes_by_source": Ver o total de ganhos do mês por plataforma.
    - "get_transaction_details": Pedido de uma lista detalhada de transações.
    - "generate_platform_chart": Gerar gráfico de ganhos por plataforma.
    - "add_reminder": Criar um lembrete.
    - "delete_reminder": Apagar um lembrete. Extraia o messageId.
    - "list_reminders": Ver todos os lembretes pendentes.
    - "greeting": Saudação simples.
    - "instructions": Pedido de ajuda ou instruções.
    - "get_vehicle_details": Ver informações do veículo cadastrado.
    - "start_turn": Iniciar turno de trabalho.
    - "end_turn": Encerrar turno de trabalho.
    - "submit_turn_income": O usuário está informando os ganhos detalhados do turno.
    - "set_turn_reminder": O usuário quer definir um horário para o lembrete diário de turno.
    - "set_turn_goal": O usuário quer definir uma meta de ganhos para o turno.
    - "unknown": A intenção não se encaixa nas anteriores.

  2. REGRAS PARA EXTRAÇÃO DE DADOS EM:
    2a. "start_turn" e "end_turn":
      - Extraia OBRIGATORIAMENTE o valor numérico da quilometragem (KM) para o campo "mileage".
    
    2b. "submit_turn_income":
      - O usuário informará os ganhos e o número de corridas por plataforma. Ex: "250 na zev em 10 corridas, 120 na uber em 5 corridas".
      - Extraia esses dados em um array chamado 'incomes'.
      - Cada item no array deve ser um objeto com 'source' (string), 'amount' (number) e 'count' (number).

    2c. "add_expense":
      - amount: O valor numérico do gasto.
      - description: A descrição do gasto.
      - CLASSIFIQUE a categoria em uma das seguintes:
        - 'Recarga Elétrica', 'Manutenção (Pneus/Freios)', 'Manutenção Corretiva', 'Manutenção Preventiva', 'Limpeza e Estética', 'Acessórios e Equipamentos', 'Software/Assinaturas do Veículo', 'Seguro', 'Parcela do Aluguel/Financiamento', 'IPVA e Licenciamento', 'Multas', 'Pedágio', 'Estacionamento', 'Alimentação/Água', 'Plano de Celular/Internet', 'Contabilidade/MEI', 'Moradia (Aluguel, Condomínio)', 'Contas (Água, Luz, Gás)', 'Educação', 'Saúde (Plano, Farmácia)', 'Lazer e Entretenimento', 'Compras Pessoais', 'Outros'.
      - Se a categoria for 'Recarga Elétrica', extraia também o campo 'kwh' (number) se ele for mencionado.
    
    2d. "add_income":
      - Esta intenção é para registrar ganhos AVULSOS, como gorjetas e bônus.
      - Extraia 'amount', 'description', 'category' (apenas 'Gorjeta', 'Bônus', 'Outros') e 'source'.
      - NÃO use para corridas.
      
    2e. "add_reminder":
      - extraia 'description', 'date' e 'type'.
      - O 'type' DEVE ser uma das categorias de gasto ou ganho que você já conhece (ex: 'Pagamento', 'Manutenção', 'Limpeza', 'Recarga Elétrica', etc.). Se não se encaixar, use 'Outros'.
      - Se a data for **absoluta** (ex: "amanhã às 15h", "dia 20"), extraia 'date' no formato YYYY-MM-DDTHH:mm:ss.
      - Se a data for **relativa** (ex: "daqui 5 minutos", "em 2 horas"), extraia 'relativeMinutes' com o total de minutos. Se 'relativeMinutes' for extraído, NÃO extraia 'date'.

  3. FORMATO DA RESPOSTA:
     Responda APENAS com um objeto JSON válido, sem nenhum texto ou formatação adicional.
     {
       "intent": "string",
       "data": {
         "mileage": number,
         "amount": number,
         "description": "string",
         "category": "string",
         "source": "string",
         "distance": number, 
         "messageId": "string",
         "period": "string ('today', 'week')",
         "days": number,
         "month": "string (MM)",
         "monthName": "string",
         "date": "string (ISO 8601)",
         "type": "string"
       }
     }

  EXEMPLOS:

  - User: "40 na recarga"
    Response: { "intent": "add_expense", "data": { "amount": 40, "description": "recarga", "category": "Recarga Elétrica" } }
  - User: "recarga de 10kWh por 12 reais"
    Response: { "intent": "add_expense", "data": { "amount": 12, "description": "recarga", "category": "Recarga Elétrica", "kwh": 10 } }
  - User: "gastei 30 reais numa recarga de 15kWh"
    Response: { "intent": "add_expense", "data": { "amount": 30, "description": "recarga", "category": "Recarga Elétrica", "kwh": 15 } }
  - User: "gastei 1200 com o aluguel de casa"
    Response: { "intent": "add_expense", "data": { "amount": 1200, "description": "aluguel de casa", "category": "Moradia (Aluguel, Condomínio)" } }
  - User: "paguei 85 na farmácia"
    Response: { "intent": "add_expense", "data": { "amount": 85, "description": "farmácia", "category": "Saúde (Plano, Farmácia)" } }
  
  - User: "ganhei 20 de gorjeta"
    Response: { "intent": "add_income", "data": { "amount": 20, "description": "gorjeta", "category": "Gorjeta", "source": "Outros" } }
  
  - User: "300 na z-ev em 12 corridas, 150 na 99 em 7 corridas"
    Response: { "intent": "submit_turn_income", "data": { "incomes": [{ "source": "Z-EV", "amount": 300, "count": 12 }, { "source": "99pop", "amount": 150, "count": 7 }] } }
  - User: "180 na uber em 8 corridas, 90 indrive em 4"
    Response: { "intent": "submit_turn_income", "data": { "incomes": [{ "source": "Uber", "amount": 180, "count": 8 }, { "source": "inDrive", "amount": 90, "count": 4 }] } }
  - User: "só na zev hoje fiz 450 reais, fiz 15 corridas"
    Response: { "intent": "submit_turn_income", "data": { "incomes": [{ "source": "Z-EV", "amount": 450, "count": 15 }] } }
  - User: "particular 100 reais em 1 corrida"
    Response: { "intent": "submit_turn_income", "data": { "incomes": [{ "source": "Particular", "amount": 100, "count": 1 }] } }
  
  - User: "resumo de hoje"
    Response: { "intent": "get_period_report", "data": { "period": "today" } }
  - User: "resumo da semana"
    Response: { "intent": "get_period_report", "data": { "period": "week" } }
  - User: "resumo do mês" 
    Response: { "intent": "get_period_report", "data": { "period": "month" } }
  - User: "resumo de junho"
    Response: { "intent": "get_period_report", "data": { "month": "06", "monthName": "Junho" } }
  - User: "qual foi meu lucro em janeiro?" 
    Response: { "intent": "get_period_report", "data": { "month": "01", "monthName": "Janeiro" } }

  - User: "gasto total"
    Response: { "intent": "get_expenses_by_category", "data": {} }
  - User: "quanto gastei de recarga esse mês?"
    Response: { "intent": "get_expenses_by_category", "data": { "category": "Recarga Elétrica", "month": "${currentYear}-${currentMonth}", "monthName": "${monthName}" } }
  - User: "ver meus gastos"
    Response: { "intent": "get_expenses_by_category", "data": {} }

  - User: "receita total"
    Response: { "intent": "get_incomes_by_source", "data": {} }
  - User: "quanto ganhei na Z-EV em fevereiro?"
    Response: { "intent": "get_incomes_by_source", "data": { "source": "Uber", "month": "${currentYear}-02", "monthName": "Fevereiro" } }
  - User: "ver meus ganhos"
    Response: { "intent": "get_incomes_by_source", "data": {} }

  - User: "detalhes gastos"
    Response: { "intent": "get_transaction_details", "data": { "type": "expense" } }
  - User: "detalhes receitas"
    Response: { "intent": "get_transaction_details", "data": { "type": "income" } }
  - User: "ver detalhes"
    Response: { "intent": "get_transaction_details", "data": {} }

  - User: "gráfico de ganhos"
    Response: { "intent": "generate_platform_chart", "data": {} }
  - User: "gráfico das plataformas"
    Response: { "intent": "generate_platform_chart", "data": {} }

  - User: "me lembre hoje daqui 5 minutos de realizar ajustes no copiloto"
    Response: { "intent": "add_reminder", "data": { "description": "realizar ajustes no copiloto", "relativeMinutes": 5, "type": "Outro" } }
  - User: "me lembre em 2 horas de pagar a conta"
    Response: { "intent": "add_reminder", "data": { "description": "pagar a conta", "relativeMinutes": 120, "type": "Pagamento" } }    
  - User: "lembrete pagar seguro amanhã às 15h"
    Response: { "intent": "add_reminder", "data": { "description": "pagar seguro", "date": "${tomorrowISO}T15:00:00", "type": "Pagamento" } }
  - User: "lembrete pagar manutenção dia 15 do mês que vem"
    Response: { "intent": "add_reminder", "data": { "description": "pagar manutenção", "date": "${nextMonthExampleISO.slice(0, 10)}T09:00:00", "type": "Manutenção" } }

  - User: "iniciar turno 95430 km"
    Response: { "intent": "start_turn", "data": { "mileage": 95430 } }
  - User: "comecei a rodar com 95.430km"
    Response: { "intent": "start_turn", "data": { "mileage": 95430 } }
  - User: "encerrar turno 95600km"
    Response: { "intent": "end_turn", "data": { "mileage": 95600 } }
  - User: "parei com 95.600"
    Response: { "intent": "end_turn", "data": { "mileage": 95600 } }
  - User: "me lembre de iniciar o turno todo dia às 8"
    Response: { "intent": "set_turn_reminder", "data": { "time": "08:00" } }
  - User: "quero lembrete de turno 7h30"
    Response: { "intent": "set_turn_reminder", "data": { "time": "07:30" } }
  - User: "meta de hoje 300 reais"
    Response: { "intent": "set_turn_goal", "data": { "amount": 300 } }
  - User: "quero fazer 450 hoje"
    Response: { "intent": "set_turn_goal", "data": { "amount": 450 } }
  
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

  - User: "quais meus lembretes?"
    Response: { "intent": "list_reminders", "data": {} }
  - User: "Olá"
    Response: { "intent": "greeting", "data": {} }
  - User: "ajuda"
    Response: { "intent": "instructions", "data": {} }

  - User: "meu carro"
    Response: { "intent": "get_vehicle_details", "data": {} }
  - User: "dados do meu veículo"
    Response: { "intent": "get_vehicle_details", "data": {} }

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