import mongoose from "mongoose";
import { ALL_EXPENSE_CATEGORIES } from '../utils/categories.js';

const expenseSchema = new mongoose.Schema({
  userId: { type: String, required: true, index: true },
  amount: { type: Number, required: true },
  description: { type: String, required: true },
  category: { type: String, required: true, enum: ALL_EXPENSE_CATEGORIES },
  profileType: {
    type: String,
    enum: ['driver', 'motoboy', 'zev_driver'],
    required: true,
    index: true
  },
  
  date: { type: Date, default: Date.now },
  messageId: String,
});

export default mongoose.model("Expense", expenseSchema);