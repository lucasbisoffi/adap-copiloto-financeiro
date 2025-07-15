import mongoose from "mongoose";

const motorcycleSchema = new mongoose.Schema({
  userId: { type: String, required: true, index: true },
  brand: { type: String, required: true }, // Ex: "Honda"
  model: { type: String, required: true }, // Ex: "CG 160 Titan"
  year: { type: Number, required: true },  // Ex: 2023
  initialMileage: { type: Number, required: true }, // KM no momento do cadastro
  currentMileage: { type: Number, required: true }, // Será atualizado com o tempo
  isActive: { type: Boolean, default: true },
  createdAt: { type: Date, default: Date.now }
});

export default mongoose.model("Motorcycle", motorcycleSchema);