import mongoose from "mongoose";

// Sub-schema para gastos mensais (mantido)
const monthlySpendingSchema = new mongoose.Schema({
    month: String, // ex: "2024-08"
    amount: Number
}, { _id: false});

// NOVO: Sub-schema para ganhos mensais por plataforma
const incomeBySourceSchema = new mongoose.Schema({
    source: String, // 'Uber', '99', etc.
    amount: Number
}, { _id: false});

// Sub-schema para histórico de ganhos mensais
const monthlyIncomeSchema = new mongoose.Schema({
    month: String, // ex: "2024-08"
    totalAmount: Number,
    breakdown: [incomeBySourceSchema] // Detalhamento por fonte
}, { _id: false});


const userStatsSchema = new mongoose.Schema({
    userId: { type: String, required: true, unique: true },
    activeVehicleId: { 
        type: mongoose.Schema.Types.ObjectId, 
        ref: 'Vehicle' // "ref" diz ao Mongoose para procurar na coleção 'Vehicle'.
    },
    blocked: { type: Boolean, default: false },
    totalSpent: { type: Number, default: 0 },
    totalIncome: { type: Number, default: 0 },
    spendingHistory: [monthlySpendingSchema], // Histórico de gastos
    incomeHistory: [monthlyIncomeSchema],     // Histórico de ganhos com detalhamento
    featuresUnlocked: {
        type: [String],
        default: [],
    },
});

export default mongoose.model("UserStats", userStatsSchema);