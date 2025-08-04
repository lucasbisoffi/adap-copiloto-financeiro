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