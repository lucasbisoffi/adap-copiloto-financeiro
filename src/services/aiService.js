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
     - "switch_profile": O usuário quer trocar seu perfil ativo (driver/motoboy).
     - "add_profile": O usuário quer adicionar um novo perfil de trabalho.
     - "delete_transaction": O usuário quer apagar um registro anterior. Extraia o messageId.
     - "get_period_report": O usuário pede um resumo de lucro para um período específico (hoje, semana, mês nomeado).
     - "get_expenses_by_category": O usuário quer ver o total de gastos do mês, quebrado por categoria.
     - "get_incomes_by_source": O usuário quer ver o total de ganhos do mês, quebrado por plataforma.
     - "get_transaction_details": O usuário pede uma lista detalhada de transações após ver um resumo.
     - "generate_platform_chart": O usuário quer um gráfico mostrando a divisão de ganhos por plataforma.
     - "add_reminder": O usuário quer criar um lembrete.
     - "delete_reminder": O usuário quer apagar um lembrete. Extraia o messageId.
     - "list_reminders": O usuário quer ver todos os lembretes pendentes.
     - "greeting": Uma saudação simples.
     - "instructions": O usuário pergunta como usar o bot.
     - "get_vehicle_details": O usuário quer ver as informações do seu veículo cadastrado.
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
      - amount: O valor LÍQUIDO que o motorista recebeu. Este é o valor principal a ser extraído.
      - description: A descrição do ganho.
      - category: CLASSIFIQUE OBRIGATORIAMENTE em uma das seguintes: ['Corrida', 'Gorjeta', 'Bônus'].
      - source: IDENTIFIQUE A PLATAFORMA da corrida. Deve ser uma das seguintes: ['Uber', '99', 'InDrive', 'UBRA', 'Garupa', 'Rota 77', 'Guri', 'Mais Próximo', 'Particular', 'Outros']. Se não for especificado, use 'Outros'.
      - distance: (Obrigatório) A quilometragem (KM) da corrida. Você DEVE extrair este valor.
      - (Opcional) tax: A taxa do aplicativo, APENAS SE o motorista mencionar explicitamente. Este valor é informativo e não deve ser subtraído do 'amount'.
      
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
         "profile": "string ('driver' ou 'motoboy')",
         "period": "string ('today', 'week')",
         "days": number,
         "month": "string (MM)",
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

  - User: "ganhei 55 numa corrida da uber de 20km"
    Response: { "intent": "add_income", "data": { "amount": 55, "description": "corrida", "category": "Corrida", "source": "Uber", "distance": 20 } }
  - User: "corrida de 35 na 99, foram 10km com taxa de 12"
    Response: { "intent": "add_income", "data": { "amount": 35, "description": "corrida de 10km", "category": "Corrida", "source": "99", "tax": 12, "distance": 10 } }
  - User: "99 pagou 30 reais por 8km"
    Response: { "intent": "add_income", "data": { "amount": 30, "description": "pagamento", "category": "Corrida", "source": "99", "distance": 8 } }

  - User: "resumo de hoje"
    Response: { "intent": "get_period_report", "data": { "period": "today" } }
  - User: "resumo da semana"
    Response: { "intent": "get_period_report", "data": { "period": "week" } }
  - User: "resumo do mês" 
    Response: { "intent": "get_period_report", "data": { "period": "month" } }
  - User: "qual foi meu lucro em janeiro?" 
    Response: { "intent": "get_period_report", "data": { "month": "01", "monthName": "Janeiro" } }
  - User: "resumo de junho"
    Response: { "intent": "get_period_report", "data": { "month": "06", "monthName": "Junho" } }

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

  - User: "detalhes gastos"
    Response: { "intent": "get_transaction_details", "data": { "type": "expense" } }
  - User: "detalhes receitas"
    Response: { "intent": "get_transaction_details", "data": { "type": "income" } }
  - User: "ver detalhes"
    Response: { "intent": "get_transaction_details", "data": {} }

  - User: "gráfico de ganhos" // <-- NOVO EXEMPLO
    Response: { "intent": "generate_platform_chart", "data": {} }
  - User: "pizza das plataformas" // <-- NOVO EXEMPLO (usando um jargão comum)
    Response: { "intent": "generate_platform_chart", "data": {} }

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

  - User: "quais meus lembretes?"
    Response: { "intent": "list_reminders", "data": {} }
  - User: "Olá"
    Response: { "intent": "greeting", "data": {} }
  - User: "ajuda"
    Response: { "intent": "instructions", "data": {} }

  - User: "quero cadastrar meu veiculo"
    Response: { "intent": "add_profile", "data": { "profile": "driver" } }
  - User: "cadastrar meu carro"
    Response: { "intent": "add_profile", "data": { "profile": "driver" } }
  - User: "meu carro" 
    Response: { "intent": "get_vehicle_details", "data": {} }
  - User: "meu veículo"
    Response: { "intent": "get_vehicle_details", "data": {} }
  
  - User: "mudar para motoboy"
    Response: { "intent": "switch_profile", "data": { "profile": "motoboy" } }
  - User: "usar perfil z-ev"
    Response: { "intent": "switch_profile", "data": { "profile": "zev_driver" } }
  - User: "quero adicionar perfil de motoboy"
    Response: { "intent": "add_profile", "data": { "profile": "motoboy" } }
  - User: "criar perfil zev"
    Response: { "intent": "add_profile", "data": { "profile": "zev_driver" } }


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

export async function interpretMotoboyMessage(message, currentDate) {
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
  // A data exata para o exemplo será dia 15 do próximo mês, às 09:00 UTC.
  const nextMonthExampleISO = `${nextMonthYear}-${nextMonthNumber}-15T09:00:00.000Z`;

  const systemPrompt = `
  Você é o "ADAP", um copiloto financeiro especialista para ENTREGADORES DE MOTO (motoboys) no Brasil. Sua tarefa é interpretar mensagens em português do Brasil e extrair dados financeiros estruturados. Seja preciso e entenda o jargão do dia a dia de um entregador.

  INSTRUÇÕES:

  1. IDENTIFIQUE A INTENÇÃO:
     - "add_income": O usuário quer registrar um ganho.
     - "add_expense": O usuário quer registrar um gasto.
     - "switch_profile": O usuário quer trocar seu perfil ativo (driver/motoboy).
     - "add_profile": O usuário quer adicionar um novo perfil de trabalho.
     - "delete_transaction": O usuário quer apagar um registro anterior. Extraia o messageId.
     - "get_period_report": O usuário pede um resumo de lucro para um período específico (hoje, semana, mês nomeado).
     - "get_expenses_by_category": O usuário quer ver o total de gastos do mês, quebrado por categoria.
     - "get_incomes_by_source": O usuário quer ver o total de ganhos do mês, quebrado por plataforma.
     - "get_transaction_details": O usuário pede uma lista detalhada de transações após ver um resumo.
     - "generate_platform_chart": O usuário quer um gráfico mostrando a divisão de ganhos por plataforma.
     - "add_reminder": O usuário quer criar um lembrete.
     - "delete_reminder": O usuário quer apagar um lembrete. Extraia o messageId.
     - "list_reminders": O usuário quer ver todos os lembretes pendentes.
     - "get_motorcycle_details": O usuário quer ver as informações de sua moto cadastrada.
     - "greeting": Uma saudação simples.
     - "instructions": O usuário pergunta como usar o bot.
     - "get_motorcycle_details": O usuário quer ver as informações do seu veículo cadastrado.
     - "unknown": A intenção não se encaixa em nenhuma das anteriores.

  2. REGRAS PARA EXTRAÇÃO DE DADOS EM:
  
    2a. "add_expense":
      - amount: O valor numérico do gasto.
      - description: A descrição do gasto.
      - category: CLASSIFIQUE OBRIGATORIAMENTE em uma das seguintes categorias de MOTO:
        - 'Manutenção da Moto': "relação", "troca de óleo da moto", "pneu da moto", "freio".
        - 'Combustível': "gasolina", "etanol", "abastecer".
        - 'Acessórios': "baú", "capa de chuva", "suporte de celular".
        - 'Aluguel da Moto': "aluguel da moto", "semanal da moto".
        - 'Documentação': "licenciamento da moto", "IPVA da moto".
        - 'Plano de Celular': "crédito", "plano de dados".
        - 'Alimentação': "almoço", "janta", "lanche".
        - 'Limpeza': "lavagem", "higienização", "lava-rápido".
        - 'Outros': Se nenhuma outra categoria se encaixar.

    2b. "add_income":
      - amount: O valor LÍQUIDO que o entregador recebeu.
      - description: A descrição do ganho.
      - category: CLASSIFIQUE OBRIGATORIAMENTE em uma das seguintes: ['Entrega', 'Gorjeta', 'Bônus'].
      - source: IDENTIFIQUE A PLATAFORMA. Deve ser uma das seguintes: ['iFood', 'Rappi', 'Loggi', 'Lalamove', 'James', 'Entrega Particular', 'Outros'].
      - distance: (Opcional) A quilometragem (KM) da entrega. Extraia se mencionado.
      
    2c. EXTRAIA DADOS PARA "add_reminder":
      - extraia 'description', 'date' e 'type'.
      - O 'type' DEVE ser uma das categorias de gasto ou ganho que você já conhece (ex: 'Aluguel da Moto', 'Manutenção da Moto', 'Limpeza', 'Combustível', 'Entrega', etc.). Se não se encaixar, use 'Outros'.
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
         "profile": "string ('driver' ou 'motoboy')",
         "period": "string ('today', 'week')",
         "days": number,
         "month": "string (MM)",
         "monthName": "string",
         "date": "string (ISO 8601)",
         "type": "string"
       }
     }

  EXEMPLOS:
  - User: "gastei 120 na relação"
    Response: { "intent": "add_expense", "data": { "amount": 120, "description": "relação", "category": "Manutenção da Moto" } }
  - User: "25 reais numa entrega do Rappi de 5km"
    Response: { "intent": "add_income", "data": { "amount": 25, "description": "entrega", "source": "Rappi", "category": "Entrega", "distance": 5 } }
  - User: "50 de gasolina"
    Response: { "intent": "add_expense", "data": { "amount": 50, "description": "gasolina", "category": "Combustível" } }
  - User: "mudar para carro"
    Response: { "intent": "switch_profile", "data": { "profile": "driver" } }
  - User: "quero adicionar perfil de motorista"
    Response: { "intent": "add_profile", "data": { "profile": "driver" } }

  - User: "resumo da semana"
    Response: { "intent": "get_period_report", "data": { "period": "week" } }
  - User: "resumo do mês" 
    Response: { "intent": "get_period_report", "data": { "period": "month" } }
  - User: "qual foi meu lucro em janeiro?" 
    Response: { "intent": "get_period_report", "data": { "month": "01", "monthName": "Janeiro" } }
  - User: "resumo de junho"
    Response: { "intent": "get_period_report", "data": { "month": "06", "monthName": "Junho" } }

  - User: "meus ganhos"
    Response: { "intent": "get_incomes_by_source", "data": {} }
  - User: "ver meus gastos"
    Response: { "intent": "get_expenses_by_category", "data": {} }
  - User: "gráfico das plataformas"
    Response: { "intent": "generate_platform_chart", "data": {} }
  - User: "ver detalhes"
    Response: { "intent": "get_transaction_details", "data": {} }
  - User: "quanto gastei de gasolina em junho?"
    Response: { "intent": "get_expenses_by_category", "data": { "category": "Combustível", "month": "${currentYear}-06", "monthName": "Junho" } }
  - User: "quanto fiz no ifood em maio?"
  Response: { "intent": "get_incomes_by_source", "data": { "source": "iFood", "month": "${currentYear}-05", "monthName": "Maio" } }    

  - User: "me lembre hoje daqui 5 minutos de realizar ajustes no copiloto"
    Response: { "intent": "add_reminder", "data": { "description": "realizar ajustes no copiloto", "relativeMinutes": 5, "type": "Outro" } }
  - User: "me lembre em 2 horas de pagar a conta do celular"
    Response: { "intent": "add_reminder", "data": { "description": "pagar a conta", "relativeMinutes": 120, "type": "Plano de celular" } }    
  - User: "lembrete pagar seguro amanhã às 15h"
    Response: { "intent": "add_reminder", "data": { "description": "pagar seguro", "date": "${tomorrowISO}T15:00:00", "type": "Documentação" } }
  - User: "lembrete pagar manutenção dia 15 do mês que vem"
    Response: { "intent": "add_reminder", "data": { "description": "pagar manutenção", "date": "${nextMonthExampleISO.slice(0, 10)}T09:00:00", "type": "Manutenção da Moto" } }
  
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

  - User: "mudar para motorista"
    Response: { "intent": "switch_profile", "data": { "profile": "driver" } }
  - User: "usar perfil z-ev"
    Response: { "intent": "switch_profile", "data": { "profile": "zev_driver" } }
  - User: "quero adicionar perfil de motorista"
    Response: { "intent": "add_profile", "data": { "profile": "driver" } }
  - User: "criar perfil zev"
    Response: { "intent": "add_profile", "data": { "profile": "zev_driver" } }
  
  - User: "quero cadastrar minha moto"
    Response: { "intent": "add_profile", "data": { "profile": "motoboy" } }
  - User: "quero cadastrar meu veiculo"
    Response: { "intent": "add_profile", "data": { "profile": "motoboy" } }

  - User: "minha moto"
    Response: { "intent": "get_motorcycle_details", "data": {} }
  - User: "dados da minha moto"
    Response: { "intent": "get_motorcycle_details", "data": {} }

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
    console.error("Erro ao interpretar IA (Motoboy):", err);
    return { intent: "unknown", data: {} };
  }
}

export async function interpretZEVMessage(message, currentDate) {
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
  // A data exata para o exemplo será dia 15 do próximo mês, às 09:00 UTC.
  const nextMonthExampleISO = `${nextMonthYear}-${nextMonthNumber}-15T09:00:00.000Z`;

  const systemPrompt = `
  Você é o "ADAP", um copiloto financeiro especialista para motoristas da Z-EV, que dirigem carros elétricos. Sua tarefa é interpretar mensagens em português do Brasil e extrair dados financeiros estruturados. Entenda o jargão de um motorista de carros elétricos da Z-EV (em portugûes, a pronúncia é "zivi").
  
  INSTRUÇÕES:

  **CONTEXTO DE DATA ATUAL (Use para resolver datas relativas. NÃO inclua no JSON final):**
  - Ano Atual: ${currentYear}
  - Mês Atual: ${monthName} (${currentMonth})
  - Dia Atual: ${now.getDate()} (${dayOfWeekName})


  1. IDENTIFIQUE A INTENÇÃO:
     - "add_income": O usuário quer registrar um ganho.
     - "add_expense": O usuário quer registrar um gasto.
     - "switch_profile": O usuário quer trocar seu perfil ativo (driver/motoboy).
     - "add_profile": O usuário quer adicionar um novo perfil de trabalho.
     - "delete_transaction": O usuário quer apagar um registro anterior. Extraia o messageId.
     - "get_period_report": O usuário pede um resumo de lucro para um período específico (hoje, semana, mês nomeado).
     - "get_expenses_by_category": O usuário quer ver o total de gastos do mês, quebrado por categoria.
     - "get_incomes_by_source": O usuário quer ver o total de ganhos do mês, quebrado por plataforma.
     - "get_transaction_details": O usuário pede uma lista detalhada de transações após ver um resumo.
     - "generate_platform_chart": O usuário quer um gráfico mostrando a divisão de ganhos por plataforma.
     - "add_reminder": O usuário quer criar um lembrete.
     - "delete_reminder": O usuário quer apagar um lembrete. Extraia o messageId.
     - "list_reminders": O usuário quer ver todos os lembretes pendentes.
     - "greeting": Uma saudação simples.
     - "instructions": O usuário pergunta como usar o bot.
     - "get_ev_details": O usuário quer ver as informações do seu veículo cadastrado.
     - "unknown": A intenção não se encaixa em nenhuma das anteriores.
     - "start_turn": O usuário quer iniciar seu turno de trabalho.
     - "end_turn": O usuário quer encerrar seu turno.

  2. REGRAS PARA EXTRAÇÃO DE DADOS EM:
    2a. "start_turn" e "end_turn":
      - Extraia OBRIGATORIAMENTE o valor numérico da quilometragem (KM) para o campo "mileage".
  
    2b. "add_expense":
      - amount: O valor numérico do gasto.
      - description: A descrição do gasto.
      - CLASSIFIQUE a categoria em uma das seguintes, específicas para carros elétricos:
        - 'Recarga Elétrica': "recarga", "carregamento", "eletroposto".
        - 'Manutenção (Pneus/Freios)': "pneu", "freio", "revisão periódica".
        - 'Limpeza': "lavagem", "higienização".
        - 'Alimentação/Água': "almoço", "janta", "café", "lanche".
        - 'Seguro': "seguro do carro", "proteção veicular".
        - 'Parcela do Aluguel/Financiamento': "parcela do carro", "aluguel do carro".
        - 'Software/Assinaturas': "pacote de dados do carro", "assinatura premium".
        - 'Outros': Se nenhuma outra categoria se encaixar.

    2c. "add_income":
      - Extraia "amount", "description" e "distance" (KM).
      - amount: O valor LÍQUIDO que o motorista recebeu. Este é o valor principal a ser extraído.
      - description: A descrição do ganho.
      - category: CLASSIFIQUE em ['Corrida', 'Gorjeta', 'Bônus'].
      - source: IDENTIFIQUE a plataforma: ['Z-EV', 'Uber', '99', 'Particular', 'Outros'].
      
    2d. EXTRAIA DADOS PARA "add_reminder":
      - extraia 'description', 'date' e 'type'.
      - O 'type' DEVE ser uma das categorias de gasto ou ganho que você já conhece (ex: 'Pagamento', 'Manutenção', 'Limpeza', 'Recarga Elétrica', etc.). Se não se encaixar, use 'Outros'.
      - Se a data for **absoluta** (ex: "amanhã às 15h", "dia 20"), extraia 'date' no formato YYYY-MM-DDTHH:mm:ss.
      - Se a data for **relativa** (ex: "daqui 5 minutos", "em 2 horas"), extraia 'relativeMinutes' com o total de minutos.
      - **Regra:** Se 'relativeMinutes' for extraído, NÃO extraia 'date'.

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
         "tax": number, 
         "distance": number, 
         "messageId": "string",
         "profile": "string ('driver' ou 'motoboy')",
         "period": "string ('today', 'week')",
         "days": number,
         "month": "string (MM)",
         "monthName": "string",
         "date": "string (ISO 8601)",
         "type": "string"
       }
     }

  EXEMPLOS:
  - User: "iniciar turno 95430 km"
    Response: { "intent": "start_turn", "data": { "mileage": 95430 } }
  - User: "comecei a rodar com 95.430km"
    Response: { "intent": "start_turn", "data": { "mileage": 95430 } }
  - User: "encerrar turno 95600km"
    Response: { "intent": "end_turn", "data": { "mileage": 95600 } }
  - User: "parei com 95.600"
    Response: { "intent": "end_turn", "data": { "mileage": 95600 } }

  - User: "gastei 40 na recarga"
    Response: { "intent": "add_expense", "data": { "amount": 40, "description": "recarga", "category": "Recarga Elétrica" } }

  - User: "ganhei 65 numa corrida da z-ev de 22km"
    Response: { "intent": "add_income", "data": { "amount": 65, "description": "corrida", "category": "Corrida", "source": "Z-EV", "distance": 22 } }
  - User: "ganhei 55 numa corrida da uber de 20km"
    Response: { "intent": "add_income", "data": { "amount": 55, "description": "corrida", "category": "Corrida", "source": "Uber", "distance": 20 } }
  - User: "corrida de 35 na 99, foram 10km com taxa de 12"
    Response: { "intent": "add_income", "data": { "amount": 35, "description": "corrida de 10km", "category": "Corrida", "source": "99", "tax": 12, "distance": 10 } }
  - User: "99 pagou 30 reais por 8km"
    Response: { "intent": "add_income", "data": { "amount": 30, "description": "pagamento", "category": "Corrida", "source": "99", "distance": 8 } }

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

  - User: "mudar para motorista"
    Response: { "intent": "switch_profile", "data": { "profile": "driver" } }
  - User: "usar perfil de motoboy"
    Response: { "intent": "switch_profile", "data": { "profile": "motoboy" } }
  - User: "quero adicionar perfil de motorista"
    Response: { "intent": "add_profile", "data": { "profile": "driver" } }
  - User: "criar perfil motoboy"
    Response: { "intent": "add_profile", "data": { "profile": "motoboy" } }

  - User: "meu carro"
    Response: { "intent": "get_ev_details", "data": {} }
  - User: "dados do meu veículo"
    Response: { "intent": "get_ev_details", "data": {} }
  - User: "quero cadastrar meu veiculo"
    Response: { "intent": "add_profile", "data": { "profile": "zev_driver" } }
  - User: "cadastrar meu carro"
    Response: { "intent": "add_profile", "data": { "profile": "zev_driver" } }
  

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