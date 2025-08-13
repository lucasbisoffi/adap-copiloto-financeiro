import mongoose from "mongoose";
import { ALL_INCOME_CATEGORIES } from '../utils/categories.js';

const incomeSchema = new mongoose.Schema({
  userId: { type: String, required: true, index: true },
  amount: { type: Number, required: true },
  description: { type: String, required: true },
  category: { type: String, required: true, enum: ALL_INCOME_CATEGORIES },
  source: { type: String, required: true },
  tax: { type: Number, required: false },
  distance: { type: Number, required: false },
  
  count: { type: Number, required: false },

  profileType: { 
    type: String, 
    enum: ['driver', 'motoboy', 'zev_driver'],
    required: true,
    index: true
  },
  date: { type: Date, default: Date.now },
  messageId: String,
});

export default mongoose.model("Income", incomeSchema);