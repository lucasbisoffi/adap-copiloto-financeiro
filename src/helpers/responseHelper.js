// src/helpers/responseHelper.js
import { devLog } from './logger.js';

//substituir 'twiml.message(' por 'sendOrLogMessage(twiml,' no webhook.js e messages.js

/**
 * Lida com o envio de mensagens, enviando para o Twilio em produção
 * ou apenas logando no console em desenvolvimento/teste.
 * @param {object} twiml - O objeto TwiML de resposta.
 * @param {string} message - A mensagem a ser enviada.
 */
export function sendOrLogMessage(twiml, message) {
  if (process.env.NODE_ENV === 'production') {
    // --- AMBIENTE DE PRODUÇÃO ---
    // Envia a mensagem de verdade.
    twiml.message(message);
  } else {
    // --- AMBIENTE DE DESENVOLVIMENTO/TESTE ---
    // Apenas registra a mensagem no console.
    // Isso nos permite ver a resposta sem gastar a cota do Twilio.
    devLog('--- [SIMULANDO RESPOSTA TWILIO] ---');
    devLog(message);
    devLog('------------------------------------');
    // twiml.message() não é chamado, então nenhuma mensagem é enviada.
  }
}