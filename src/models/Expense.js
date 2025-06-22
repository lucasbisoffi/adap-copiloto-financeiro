import mongoose from "mongoose";

// O "ADAP: motoristas" possui categorias pré-definidas para os motoristas

const expenseSchema = new mongoose.Schema({
  userId: { type: String, required: true, index: true },
  amount: { type: Number, required: true },
  description: { type: String, required: true },
  category: {
    type: String,
    required: true,
    enum: [
      // Custos Variáveis (ligados ao uso)
      'Combustível',
      'Manutenção', // Troca de óleo, pneu, etc.
      'Limpeza', // Lavagem, higienização
      'Alimentação/Água', // Gastos durante o trabalho
      'Pedágio',

      // Custos Fixos (periódicos)
      'Aluguel do Veículo',
      'Parcela do Financiamento',
      'Seguro',
      'Impostos/Taxas Anuais', // IPVA, Licenciamento

      // Custos Operacionais
      'Plano de Celular',
      'Taxa da Plataforma',

      // Outros
      'Outros'
    ]
  },
  date: { type: Date, default: Date.now },
  messageId: String,
});

export default mongoose.model("Expense", expenseSchema);