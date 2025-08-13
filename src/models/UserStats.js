import mongoose from "mongoose";

const userStatsSchema = new mongoose.Schema(
  {
    userId: { type: String, required: true, unique: true },
    profiles: {
      driver: { type: Boolean, default: false },
      motoboy: { type: Boolean, default: false },
      zev_driver: { type: Boolean, default: false },
    },
    activeProfile: {
      type: String,
      enum: ["driver", "motoboy", "zev_driver"],
    },
    isLeader: { type: Boolean, default: false },
    isDependent: { type: Boolean, default: false },
    leaderUserId: { type: String, index: true, default: null },
    isTurnActive: { type: Boolean, default: false },
    currentTurnStartMileage: { type: Number, default: 0 },
    currentTurnStartDate: { type: Date },

    turnStartReminderTime: { type: String, default: null },
    currentTurnGoal: {
      amount: { type: Number },
      isNotified: { type: Boolean, default: false }
    },

    welcomedToV2: { type: Boolean, default: false },
    activeVehicleId: { type: mongoose.Schema.Types.ObjectId, ref: "Vehicle" },
    activeMotorcycleId: { type: mongoose.Schema.Types.ObjectId, ref: "Motorcycle" },
    activeEVId: { type: mongoose.Schema.Types.ObjectId, ref: "ElectricVehicle" },
    blocked: { type: Boolean, default: false },
    totalSpent: { type: Number, default: 0 },
    totalIncome: { type: Number, default: 0 },
    featuresUnlocked: { type: [String], default: [] },
  },
  { timestamps: true }
);

export default mongoose.model("UserStats", userStatsSchema);