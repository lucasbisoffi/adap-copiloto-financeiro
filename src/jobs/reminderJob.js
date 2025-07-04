import cron from 'node-cron';
import Reminder from '../models/Reminder.js';
import { sendTemplatedMessage } from '../services/twilioService.js';
import { devLog } from '../helpers/logger.js';

async function checkAndSendReminders() {
  const now = new Date();
  devLog(`[ReminderJob] Executando... Verificando lembretes para antes de ${now.toISOString()}`);

  try {
    const dueReminders = await Reminder.find({ date: { $lte: now } });

    if (dueReminders.length === 0) {
      return;
    }

    devLog(`[ReminderJob] Encontrou ${dueReminders.length} lembrete(s) para enviar.`);

    for (const reminder of dueReminders) {
      try {
        devLog(`Processando lembrete para ${reminder.userId}: "${reminder.description}"`);
        
        //Verificação de Ambiente
        if (process.env.NODE_ENV === 'test') {
          // Em PRODUÇÃO, envia a mensagem de verdade.
          await sendTemplatedMessage(
            reminder.userId,
            process.env.TWILIO_TEMPLATE_REMINDER,
            { 1: reminder.description } 
          );
        } else {
          // Em TESTE, apenas simula o envio no console.
          devLog(`DEV: [SIMULANDO ENVIO] Lembrete: "${reminder.description}" para ${reminder.userId}`);
        }

        devLog(`[ReminderJob] Lembrete #${reminder.messageId} processado com sucesso.`);
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
  const schedule = '* * * * *'; // Mantemos a cada minuto para testes e precisão de horário.
  devLog(`[Scheduler] Job de lembretes iniciado. Verificando a cada minuto.`);
  
  cron.schedule(schedule, checkAndSendReminders, {
      scheduled: true,
      timezone: "America/Sao_Paulo"
  });
}