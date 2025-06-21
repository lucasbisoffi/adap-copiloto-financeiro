// src/jobs/reminderJob.js

// Imports necessários para o job funcionar
import cron from 'node-cron';
import Reminder from '../models/Reminder.js';
import { sendTemplatedMessage } from '../services/twilioService.js';
import { devLog } from '../helpers/logger.js';

// Função que contém a LÓGICA do que fazer
async function checkAndSendReminders() {
  devLog('⏰ Executando job de verificação de lembretes...');
  const today = new Date();
  today.setHours(23, 59, 59, 999); // Considera até o final do dia de hoje.

  try {
    const dueReminders = await Reminder.find({
      reminderDate: { $lte: today },
      notified: false,
    });

    if (dueReminders.length === 0) {
      devLog('✅ Nenhum lembrete para enviar hoje.');
      return;
    }

    devLog(`Encontrados ${dueReminders.length} lembretes para enviar.`);

    for (const reminder of dueReminders) {
      // Verificando o ambiente para simular o envio em desenvolvimento
      if (process.env.NODE_ENV === 'production') {
        // --- CÓDIGO DE PRODUÇÃO ---
        devLog(`PROD: Enviando lembrete "${reminder.description}" para ${reminder.userId}`);
        await sendTemplatedMessage(
          reminder.userId,
          'lembrete_adap', // Nome do template
          { 1: reminder.description }
        );
      } else {
        // --- CÓDIGO DE DESENVOLVIMENTO/TESTE ---
        devLog(`DEV: [SIMULANDO ENVIO] Lembrete: "${reminder.description}" para ${reminder.userId}`);
      }
      
      // Marca o lembrete como notificado
      reminder.notified = true;
      await reminder.save();
      devLog(`Lembrete para ${reminder.userId} marcado como notificado.`);
    }
  } catch (error) {
    console.error('❌ Erro durante a execução do job de lembretes:', error);
  }
}

// Função para iniciar e EXPORTAR o AGENDAMENTO
export function startReminderJob() {
  // Agenda a função para rodar todos os dias às 9:00 da manhã.
  cron.schedule('0 9 * * *', checkAndSendReminders, {
    scheduled: true,
    timezone: "America/Sao_Paulo"
  });

  devLog('🚀 Job de lembretes agendado para rodar todos os dias às 9:00.');
}