import { devLog } from './logger.js';
import { sendTextMessage } from "../services/twilioService.js";

//substituir 'twiml.message(' por 'sendOrLogMessage(twiml,' no webhook.js e messages.js
export function sendOrLogMessage(twiml, message) {
  if (process.env.NODE_ENV === 'prod') {
    twiml.message(message);
  } else {
    devLog('--- [SIMULANDO RESPOSTA TWILIO] ---');
    devLog(message);
    devLog('------------------------------------');
    // twiml.message() não é chamado, então nenhuma mensagem é enviada.
  }
}

const MAX_CHARS = 1550; // Limite de caracteres do WhatsApp com uma margem de segurança 50 caracteres
export async function sendChunkedMessage(userId, fullMessage) {
  // Se a mensagem for curta, envie de uma vez e encerre.
  if (fullMessage.length <= MAX_CHARS) {
    await sendTextMessage(userId, fullMessage);
    return;
  }

  devLog(`[Chunker] Mensagem longa detectada (${fullMessage.length} chars). Iniciando fragmentação.`);

  const chunks = [];
  const lines = fullMessage.split('\n');
  let currentChunk = "";

  for (const line of lines) {
    // Verifica se adicionar a próxima linha excederia o limite.
    // O "+ 1" representa o caractere '\n' que será adicionado.
    if (currentChunk.length + line.length + 1 > MAX_CHARS) {
      // Se exceder, o chunk atual está pronto para ser enviado.
      chunks.push(currentChunk);
      // O novo chunk começa com a linha atual.
      currentChunk = line;
    } else {
      // Se não exceder, adiciona a linha ao chunk atual.
      currentChunk += (currentChunk ? '\n' : '') + line;
    }
  }

  // Não se esqueça de adicionar o último chunk restante!
  if (currentChunk) {
    chunks.push(currentChunk);
  }

  devLog(`[Chunker] Mensagem dividida em ${chunks.length} partes. Enviando...`);

  // Envia cada chunk em sequência para garantir a ordem.
  for (const chunk of chunks) {
    await sendTextMessage(userId, chunk);
  }

  devLog(`[Chunker] Todas as partes foram enviadas para ${userId}.`);
}