import twilio from "twilio";
import { devLog } from "../helpers/logger.js";
//import { formatPhoneNumber } from "../utils/formatPhone.js";

const client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);

export async function sendReportImage(userId, imageUrl, caption) {
  try {
    const message = await client.messages.create({
      from: `whatsapp:${process.env.TWILIO_PHONE_NUMBER}`,
      to: userId, // O userId (ex: 'whatsapp:+55...') já está no formato correto.
      mediaUrl: [imageUrl],
      body: caption,
    });
    console.log(`✅ Imagem de relatório enviada: ${message.sid}`);
  } catch (error) {
    console.error("❌ Erro ao enviar imagem de relatório:", error);
  }
}

export async function sendTemplatedMessage(to, contentSid, contentVariables) {
  
  if (!contentSid) {
    console.error(`❌ Falha ao enviar mensagem: O ID do template (contentSid) não foi fornecido.`);
    throw new Error('O ID do template (contentSid) é obrigatório.');
  }

  try {
    devLog(`Enviando mensagem de template para ${to}... SID: ${contentSid}`);
    await client.messages.create({
      from: `whatsapp:${process.env.TWILIO_PHONE_NUMBER}`, 
      to: to,
      contentSid: contentSid, 
      contentVariables: JSON.stringify(contentVariables),
    });
    devLog(`✅ Mensagem de template enviada com sucesso para ${to}.`);
  } catch (error) {
    devLog(`❌ Falha ao enviar mensagem de template para ${to}: ${error.message}`);
    throw error;
  }
}

export async function sendTextMessage(to, body) {
  if (process.env.NODE_ENV !== 'prod') {
    console.log('--- MODO TESTE (Mensagem Assíncrona) ---');
    devLog(`Destinatário: ${to}`);
    devLog(`Corpo: ${body}`);
    console.log('-----------------------------------------');
    return;
  }
  
  try {
    devLog(`Enviando mensagem de texto para ${to}...`);
    await client.messages.create({
      from: `whatsapp:${process.env.TWILIO_PHONE_NUMBER}`,
      to: to,
      body: body,
    });
    devLog(`✅ Mensagem de texto enviada com sucesso para ${to}.`);
  } catch (error) {
    devLog(`❌ Falha ao enviar mensagem de texto para ${to}: ${error.message}`);
  }
}