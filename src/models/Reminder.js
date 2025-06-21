import mongoose from "mongoose";

const reminderSchema = new mongoose.Schema({
    userId: { type: String, required: true, index: true },
    description: { type: String, required: true },
    reminderDate: { type: Date, required: true }, // Mudei 'date' para 'reminderDate' para clareza
    type: {
        type: String,
        required: true,
        enum: ['Pagamento', 'Manutenção', 'Documento', 'Outro']
    },
    isRecurring: { type: Boolean, default: false }, // É um lembrete recorrente?
    notified: { type: Boolean, default: false }, // O usuário já foi notificado?
    messageId: String, // ID da mensagem que criou o lembrete
});

export default mongoose.model("Reminder", reminderSchema);