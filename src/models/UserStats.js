import mongoose from "mongoose";

const userStatsSchema = new mongoose.Schema(
  {
    userId: { type: String, required: true, unique: true },

    isLeader: { type: Boolean, default: false },
    isDependent: { type: Boolean, default: false },
    leaderUserId: { type: String, index: true, default: null },
    
    isTurnActive: { type: Boolean, default: false },
    currentTurnStartMileage: { type: Number, default: 0 },
    currentTurnStartDate: { type: Date },
    turnStartReminderTime: { type: String, default: null }, //lembrete para iniciar o turno
    // Armazena a meta do turno atual e controla a notificação.
    currentTurnGoal: {
      amount: { type: Number },
      isNotified: { type: Boolean, default: false }
    },

    vehicleId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "ElectricVehicle",
    },

    blocked: { type: Boolean, default: false },
    totalSpent: { type: Number, default: 0 },
    totalIncome: { type: Number, default: 0 },
    featuresUnlocked: {
      type: [String],
      default: [],
    },
  },
  { timestamps: true }
); // Adiciona createdAt e updatedAt automaticamente

export default mongoose.model("UserStats", userStatsSchema);