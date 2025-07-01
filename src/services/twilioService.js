import twilio from "twilio";
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

export async function sendTemplatedMessage(to, templateName, bodyVariables) {
  try {
    await client.messages.create({
      // O twilioPhoneNumber precisa estar no formato 'whatsapp:+...'
      from: `whatsapp:${process.env.TWILIO_PHONE_NUMBER}`,
      to: to, // O 'to' (userId) já está no formato correto.
      // O 'contentSid' é a chave para enviar templates.
      contentSid: process.env.TWILIO_TEMPLATE_SID,
      contentVariables: JSON.stringify(bodyVariables),
    });
    console.log(`✅ Mensagem de template '${templateName}' enviada para ${to}`);
  } catch (error) {
    console.error(`❌ Falha ao enviar mensagem de template para ${to}:`, error.message);
  }
}