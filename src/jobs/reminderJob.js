import cron from "node-cron";
import Reminder from "../models/Reminder.js";
import { sendTemplatedMessage } from "../services/twilioService.js";
import { devLog } from "../helpers/logger.js";

async function checkAndSendReminders() {
  devLog("⏰ Executando job de verificação de lembretes...");

  const now = new Date();
  
  const startOfTodayUTC = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 0, 0, 0, 0));
  
  const endOfTodayUTC = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 23, 59, 59, 999));
  

  try {
    const dueReminders = await Reminder.find({
      reminderDate: { $gte: startOfTodayUTC, $lte: endOfTodayUTC },
      notified: false,
    });

    if (dueReminders.length === 0) {
      devLog("✅ Nenhum lembrete para enviar hoje.");
      return;
    }
    devLog(`Encontrados ${dueReminders.length} lembretes para enviar.`);

    for (const reminder of dueReminders) {
      if (process.env.NODE_ENV === "production") {
      } else {
        devLog(
          `DEV: [SIMULANDO ENVIO] Lembrete: "${reminder.description}" para ${reminder.userId}`
        );
      }

      reminder.notified = true;
      await reminder.save();
      devLog(`Lembrete para ${reminder.userId} marcado como notificado.`);
    }
  } catch (error) {
    console.error("❌ Erro durante a execução do job de lembretes:", error);
  }
}

export function startReminderJob() {
  cron.schedule("* 6 * * *", checkAndSendReminders, {
    scheduled: true,
    timezone: "America/Sao_Paulo",
  });

  devLog("🚀 Job de lembretes agendado para rodar a cada minuto (MODO DE TESTE).");
}