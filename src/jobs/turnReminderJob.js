import cron from "node-cron";
import UserStats from "../models/UserStats.js";
import { sendTextMessage } from "../services/twilioService.js";
import { devLog } from "../helpers/logger.js";
import { TIMEZONE } from "../utils/dateUtils.js";

async function checkAndSendTurnReminders() {
  const now = new Date();
  const currentTime = now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: TIMEZONE });

  // 1. Lembrete para INICIAR o turno
  try {
    const usersToRemindStart = await UserStats.find({
      turnStartReminderTime: currentTime,
      isTurnActive: false,
    });

    for (const user of usersToRemindStart) {
      devLog(`[TurnReminderJob] Enviando lembrete de INÍCIO para ${user.userId}`);
      await sendTextMessage(user.userId, "⏰ Hora de começar a rodar! Não se esqueça de iniciar seu turno. Ex: `iniciar turno 12345 km`");
    }
  } catch (error) {
    devLog("[TurnReminderJob] Erro ao buscar usuários para lembrar de iniciar turno:", error);
  }

  // 2. Lembrete de que o turno está ATIVO (de hora em hora)
  if (now.getMinutes() === 0) { // Executa apenas na "hora cheia" (ex: 08:00, 09:00)
    try {
      const usersInTurn = await UserStats.find({ isTurnActive: true });
      for (const user of usersInTurn) {
        devLog(`[TurnReminderJob] Enviando lembrete de TURNO ATIVO para ${user.userId}`);
        await sendTextMessage(user.userId, "Lembrete amigável: seu turno ainda está ativo. Quando terminar, não se esqueça de encerrá-lo! 😉");
      }
    } catch (error) {
      devLog("[TurnReminderJob] Erro ao buscar usuários com turno ativo:", error);
    }
  }
}

export function startTurnReminderJob() {
  devLog(`[Scheduler] Job de lembretes de turno iniciado.`);
  cron.schedule("* * * * *", checkAndSendTurnReminders, {
    scheduled: true,
    timezone: TIMEZONE,
  });
}