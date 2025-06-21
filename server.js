import "dotenv/config";
import express from "express";
import rateLimit from "express-rate-limit";
import rateLimitMongo from "rate-limit-mongo";
import { connectToDatabase } from "./src/config/database.js";
import webhookRouter from "./src/routes/webhook.js";
import { startReminderJob } from './src/jobs/reminderJob.js';

const app = express();
app.use("/images", express.static("/tmp"));
app.use(express.urlencoded({ extended: true }));

// Sua configuração de Rate Limit está perfeita, nenhuma mudança necessária aqui.
const mongoStore = new rateLimitMongo({
  uri: process.env.MONGO_URI,
  collectionName: "rateLimits",
  expireTimeMs: 60 * 1000,
});

const userLimiter = rateLimit({
  windowMs: 60 * 1000, 
  max: 60,
  message: {
    status: 429,
    body: "🚫 Você excedeu o limite de requisições. Tente novamente mais tarde."
  },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => req.body?.From || req.ip,
  store: mongoStore
});

// Aplica o middleware do limiter apenas na rota do webhook
app.use("/webhook", userLimiter, webhookRouter);

// =======================================================================
// MUDANÇA CRÍTICA: LÓGICA DE INICIALIZAÇÃO
// =======================================================================
connectToDatabase()
  .then(() => {
    console.log("✅ MongoDB conectado com sucesso.");

    // 1. AGORA que o banco está conectado, iniciamos o job de lembretes.
    startReminderJob();

    // 2. E AGORA iniciamos o servidor para aceitar requisições.
    const PORT = process.env.PORT || 3000;
    app.listen(PORT, () => {
      console.log(`🚀 Servidor ADAP: Co-piloto Financeiro rodando na porta ${PORT}`);
    });
  })
  .catch((err) => {
    // Se a conexão com o banco falhar, o servidor não deve nem iniciar.
    console.error("❌ Falha crítica ao conectar ao MongoDB. O servidor não será iniciado.", err);
    process.exit(1); // Encerra o processo com um código de erro.
  });