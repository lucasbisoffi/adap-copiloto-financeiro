// Dentro de src/jobs/reminderJob.js

async function checkAndSendReminders() {
  devLog('⏰ Executando job de verificação de lembretes...');
  const today = new Date();
  today.setHours(23, 59, 59, 999);

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
      // MUDANÇA INTELIGENTE: Verificando o ambiente
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
        // Não enviamos a mensagem, apenas simulamos.
      }
      
      // A lógica de negócio principal continua a mesma em ambos os ambientes.
      reminder.notified = true;
      await reminder.save();
      devLog(`Lembrete para ${reminder.userId} marcado como notificado.`);
    }
  } catch (error) {
    console.error('❌ Erro durante a execução do job de lembretes:', error);
  }
}