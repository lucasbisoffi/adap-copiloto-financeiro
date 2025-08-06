import "dotenv/config";
import express from "express";
import rateLimit from "express-rate-limit";
import rateLimitMongo from "rate-limit-mongo";
// Importa nossas funções do banco de dados e outros módulos.
import { connectToDatabase } from "./src/config/database.js";
import webhookRouter from "./src/routes/webhook.js";
import { startReminderJob } from "./src/jobs/reminderJob.js";
import { startTurnReminderJob } from './src/jobs/turnReminderJob.js';

// Bloco de verificação de variáveis de ambiente no início de tudo.
const requiredEnvVars = [
  "MONGO_URI",
  "OPENAI_API_KEY",
  "TWILIO_ACCOUNT_SID",
  "TWILIO_AUTH_TOKEN",
  "TWILIO_PHONE_NUMBER",
];
for (const varName of requiredEnvVars) {
  if (!process.env[varName]) {
    console.error(
      `❌ ERRO CRÍTICO: A variável de ambiente ${varName} não está definida.`
    );
    console.error(
      "Verifique se o seu arquivo .env está correto e na raiz do projeto."
    );
    process.exit(1);
  }
}



const app = express();
app.use("/images", express.static("/tmp"));
app.use(express.urlencoded({ extended: true }));

// A inicialização do servidor agora está encapsulada em uma função 'async'.
async function startServer() {
  try {
    // 1. Tenta conectar ao banco de dados e espera a conclusão.
    await connectToDatabase();
    console.log("✅ MongoDB conectado com sucesso.");

    // 2. SÓ DEPOIS da conexão, configura o que depende dela.
    const mongoStore = new rateLimitMongo({
      // MUDANÇA: Passando a URI diretamente, como a biblioteca pediu.
      uri: process.env.MONGO_URI,
      collectionName: "rateLimits",
      // A linha 'connection' não é mais necessária.
      expireTimeMs: 60 * 1000, // É uma boa prática definir o tempo de expiração.
    });

    const userLimiter = rateLimit({
      windowMs: 60 * 1000,
      max: 60,
      message: {
        status: 429,
        body: "🚫 Você excedeu o limite de requisições.",
      },
      standardHeaders: true,
      legacyHeaders: false,
      keyGenerator: (req) => req.body?.From || req.ip,
      store: mongoStore,
    });

    // 3. Aplica os middlewares e rotas.
    app.use("/webhook", userLimiter, webhookRouter);

    // 4. Inicia os jobs agendados.
    startReminderJob();
    startTurnReminderJob();

    // 5. Inicia o servidor para escutar por requisições.
    const PORT = process.env.PORT || 3000;
    app.listen(PORT, () => {
      console.log(
        `🚀 Servidor ADAP: Copiloto rodando na porta ${PORT}`
      );
    });
  } catch (error) {
    // Se 'connectToDatabase' ou qualquer outra etapa inicial falhar,
    // o servidor não será iniciado.
    console.error(
      "❌ Falha crítica na inicialização do servidor. Encerrando.",
      error
    );
    process.exit(1);
  }
}

// Chama a função para iniciar todo o processo.
startServer();
