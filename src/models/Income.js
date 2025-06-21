import mongoose from "mongoose";

// O "ADAP: motoristas" possui categorias pré-definidas para os motoristas

const incomeSchema = new mongoose.Schema({
  userId: { type: String, required: true, index: true },
  amount: { type: Number, required: true },
  description: { type: String, required: true },
  category: {
    type: String,
    required: true,
    enum: ['Corrida', 'Gorjeta', 'Bônus']
  },
  // CAMPO CHAVE: De qual plataforma veio o ganho?
  source: {
    type: String,
    required: true,
    default: 'Outros', // Um valor padrão
    enum: ['Uber', '99', 'InDrive', 'Outros'] // Podemos adicionar mais plataformas
  },
  // CAMPOS ADICIONADOS PARA ANÁLISE DE RENTABILIDADE
  tax: { 
    type: Number, 
    required: false // Taxa cobrada pelo aplicativo
  },
  distance: {
    type: Number,
    required: false // Distância da corrida em KM
  },
  date: { type: Date, default: Date.now },
  messageId: String,
});

export default mongoose.model("Income", incomeSchema);