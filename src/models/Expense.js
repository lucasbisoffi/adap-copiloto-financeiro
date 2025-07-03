import mongoose from "mongoose";
import { EXPENSE_CATEGORIES } from '../utils/categories.js';

// O "ADAP: motoristas" possui categorias pré-definidas para os motoristas

const expenseSchema = new mongoose.Schema({
  userId: { type: String, required: true, index: true },
  amount: { type: Number, required: true },
  description: { type: String, required: true },
  category: {
    type: String,
    required: true,
    enum: EXPENSE_CATEGORIES,
  },
  date: { type: Date, default: Date.now },
  messageId: String,
});

export default mongoose.model("Expense", expenseSchema);