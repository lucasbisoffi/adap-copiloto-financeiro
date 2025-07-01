import twilio from "twilio";
import { formatPhoneNumber } from "../utils/formatPhone.js";

const client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
const twilioPhoneNumber = process.env.TWILIO_PHONE_NUMBER;

export async function sendReportImage(userId, imageUrl) {
  const formattedNumber = formatPhoneNumber(userId);

  try {
    const message = await client.messages.create({
      from: `whatsapp:${process.env.TWILIO_PHONE_NUMBER}`,
      to: formattedNumber,
      mediaUrl: [imageUrl],
      body: "📊 Relatório de gastos",
    });

    console.log(`✅ Mensagem enviada: ${message.sid}`);
  } catch (error) {
    console.error("Erro ao enviar mensagem:", error);
  }
}

export async function sendTemplatedMessage(to, templateName, bodyVariables) {
  try {
    await client.messages.create({
      from: twilioPhoneNumber,
      to: to,
      contentSid: process.env.TWILIO_TEMPLATE_SID, 
      contentVariables: JSON.stringify(bodyVariables),
    });
    console.log(`Mensagem de template '${templateName}' enviada para ${to}`);
  } catch (error) {
    console.error(`Falha ao enviar mensagem de template para ${to}:`, error.message);
  }
}