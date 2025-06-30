import cron from 'node-cron';
import Reminder from '../models/Reminder.js';
// MUDANÇA: Usaremos nosso twilioService, que é mais robusto
import { sendTemplatedMessage } from '../services/twilioService.js';
import { devLog } from '../helpers/logger.js';

async function checkAndSendReminders() {
  const now = new Date();
  devLog(`[ReminderJob] Executando... Verificando lembretes para antes de ${now.toISOString()}`);

  try {
    // A consulta busca todos os lembretes cuja data/hora é agora ou já passou.
    const dueReminders = await Reminder.find({ date: { $lte: now } });

    if (dueReminders.length === 0) {
      // Silencioso se não houver nada, para não poluir os logs.
      return;
    }

    devLog(`[ReminderJob] Encontrou ${dueReminders.length} lembrete(s) para enviar.`);

    for (const reminder of dueReminders) {
      const messageBody = `🔔 Lembrete do seu Co-piloto ADAP:\n\n*${reminder.description}*`;

      try {
        if (process.env.NODE_ENV === 'production') {
          // Em produção, usamos o template para garantir a entrega.
           await sendTemplatedMessage(
            reminder.userId,
            'lembrete_adap', // Nome do template
            { 1: reminder.description } // A variável do template
          );
        } else {
          // Em desenvolvimento, apenas simulamos.
          devLog(`DEV: [SIMULANDO ENVIO] Lembrete: "${reminder.description}" para ${reminder.userId}`);
        }
        
        devLog(`[ReminderJob] Lembrete #${reminder.messageId} processado para ${reminder.userId}.`);

        // Deleta o lembrete após o envio, como na lógica original.
        await Reminder.findByIdAndDelete(reminder._id);
        devLog(`[ReminderJob] Lembrete #${reminder.messageId} excluído.`);

      } catch (sendError) {
        devLog(`[ReminderJob] Falha ao processar lembrete #${reminder.messageId}. Erro:`, sendError);
      }
    }
  } catch (error) {
    devLog("[ReminderJob] Erro geral ao processar lembretes:", error);
  }
}

export function startReminderJob() {
  devLog("[Scheduler] Job de lembretes iniciado. Verificando a cada minuto.");
  // Roda a cada minuto para garantir a precisão do horário.
  cron.schedule("* * * * *", checkAndSendReminders, {
      scheduled: true,
      timezone: "America/Sao_Paulo"
  });
}