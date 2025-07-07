import cron from "node-cron";
import Reminder from "../models/Reminder.js";
import { sendTemplatedMessage } from "../services/twilioService.js";
import { devLog } from "../helpers/logger.js";

async function checkAndSendReminders() {
  const now = new Date();
  devLog(
    `[ReminderJob] Executando... Verificando lembretes para antes de ${now.toISOString()}`
  );

  try {
    const dueReminders = await Reminder.find({ date: { $lte: now } });

    if (dueReminders.length === 0) {
      return;
    }

    devLog(
      `[ReminderJob] Encontrou ${dueReminders.length} lembrete(s) para enviar.`
    );

    for (const reminder of dueReminders) {
    try {
        devLog(
            `Processando lembrete para ${reminder.userId}: "${reminder.description}"`
        );
        
        // --- INÍCIO DA MUDANÇA ---
        // Extrai a hora do lembrete para a variável {{2}}
        const reminderTime = reminder.date.toLocaleTimeString('pt-BR', {
            hour: '2-digit',
            minute: '2-digit',
            timeZone: 'America/Sao_Paulo'
        });

        await sendTemplatedMessage(
            reminder.userId,
            process.env.TWILIO_SANDBOX_TEMPLATE_SID, // <-- Usando o SID do Sandbox
            { 
                "1": `Lembrete: ${reminder.description}`
            }
        );

        devLog(
          `[ReminderJob] Lembrete #${reminder.messageId} processado com sucesso.`
        );
        await Reminder.findByIdAndDelete(reminder._id);
        devLog(`[ReminderJob] Lembrete #${reminder.messageId} excluído.`);
      } catch (sendError) {
        devLog(
          `[ReminderJob] Falha ao processar lembrete #${reminder.messageId}. Erro:`,
          sendError
        );
      }
    }
  } catch (error) {
    devLog("[ReminderJob] Erro geral ao processar lembretes:", error);
  }
}

export function startReminderJob() {
  const schedule = "* * * * *"; // Mantemos a cada minuto para testes e precisão de horário.
  devLog(`[Scheduler] Job de lembretes iniciado. Verificando a cada minuto.`);

  cron.schedule(schedule, checkAndSendReminders, {
    scheduled: true,
    timezone: "America/Sao_Paulo",
  });
}
