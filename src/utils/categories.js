export const DRIVER_CATEGORIES = [
  // Categorias de Gasto
  'Combustível',
  'Manutenção',
  'Limpeza',
  'Alimentação/Água',
  'Pedágio',
  'Aluguel do Veículo',
  'Parcela do Financiamento',
  'Seguro',
  'Impostos/Taxas Anuais',
  'Plano de Celular',
  
  // Categorias de Ganho
  'Corrida', 
  'Gorjeta',
  'Bônus',

  // Outras categorias que podem servir para lembretes
  'Documento',
  'Outros'
];

// Categorias específicas para Despesas
export const EXPENSE_CATEGORIES = DRIVER_CATEGORIES.filter(c => !['Corrida', 'Gorjeta', 'Bônus'].includes(c));

// Categorias específicas para Ganhos
export const INCOME_CATEGORIES = ['Corrida', 'Gorjeta', 'Bônus'];

// Tipos válidos para Lembretes (todas as categorias)
export const REMINDER_TYPES = DRIVER_CATEGORIES;