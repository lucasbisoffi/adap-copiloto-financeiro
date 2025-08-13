import mongoose from "mongoose";

const turnSchema = new mongoose.Schema({
  userId: { type: String, required: true, index: true },
  profileType: { type: String, required: true, enum: ['driver', 'motoboy', 'zev_driver'] },
  startDate: { type: Date, required: true },
  endDate: { type: Date, required: true },
  startMileage: { type: Number, required: true },
  endMileage: { type: Number, required: true },
  distanceTraveled: { type: Number, required: true },
  totalIncome: { type: Number, default: 0 },
  totalExpense: { type: Number, default: 0 },
  totalProfit: { type: Number, default: 0 },
  earningsPerKm: { type: Number, default: 0 },
  
  racesCount: { type: Number, default: 0 }
});

export default mongoose.model("Turn", turnSchema);