import mongoose from "mongoose";

const motorcycleSchema = new mongoose.Schema({
  userId: { type: String, required: true, index: true },
  brand: { type: String, required: true }, 
  model: { type: String, required: true }, 
  year: { type: Number, required: true },  
  initialMileage: { type: Number, required: true }, 
  currentMileage: { type: Number, required: true }, 
  isActive: { type: Boolean, default: true },
  createdAt: { type: Date, default: Date.now }
});

export default mongoose.model("Motorcycle", motorcycleSchema);