export const PROFILE_CONFIG = {
  driver: {
    name: 'Motorista',
    emoji: '🚗',
    incomeTerm: 'Corrida',
    incomeExample: 'uber 55 2 corridas',
    expenseExample: '45 na troca de óleo',
    vehicleName: 'carro',
    artigoDefinido: 'o',
    artigoIndefinido: 'um',
    pronomePossessivo: 'seu',
    generoObjeto: 'dele',
    hasTurnFeature: true,
    incomeCategories: ['Corrida', 'Gorjeta', 'Bônus', 'Outros'],
    expenseCategories: [
      'Combustível', 'Manutenção', 'Limpeza', 'Alimentação/Água', 'Pedágio',
      'Aluguel do Veículo', 'Parcela do Financiamento', 'Seguro', 'IPVA e Licenciamento',
      'Plano de Celular', 'Multas', 'Estacionamento', 'Moradia', 'Contas (Luz, Água)',
      'Saúde', 'Lazer', 'Outros'
    ],
    incomeSources: [
      'Uber', '99pop', 'inDrive', 'UBRA', 'Garupa', 'Rota 77',
      'Guri', 'Mais Próximo', 'Particular', 'Outros',
    ],
  },
  motoboy: {
    name: 'Entregador',
    emoji: '🏍️',
    incomeTerm: 'Entrega',
    incomeExample: 'ifood 80 5 entregas, 99pop 50 2 corridas',
    expenseExample: '50 na relação da moto',
    vehicleName: 'moto',
    artigoDefinido: 'a',
    artigoIndefinido: 'uma',
    pronomePossessivo: 'sua',
    generoObjeto: 'dela',
    hasTurnFeature: true,
    incomeCategories: ['Entrega', 'Corrida', 'Gorjeta', 'Bônus', 'Outros'],
    expenseCategories: [
      'Manutenção da Moto', 'Combustível', 'Acessórios', 'Aluguel da Moto',
      'Documentação da Moto', 'Plano de Celular', 'Alimentação', 'Limpeza',
      'Moradia', 'Contas (Luz, Água)', 'Saúde', 'Lazer', 'Outros'
    ],
    incomeSources: [
      'iFood', 'Rappi', 'Loggi', 'Lalamove', 'James', '99pop',
      'Entrega Particular', 'Outros',
    ],
  },
  zev_driver: {
    name: 'Motorista Z-EV',
    emoji: '⚡',
    incomeTerm: 'Corrida',
    incomeExample: 'zev 300 10 corridas',
    expenseExample: '35 na recarga 15kwh',
    vehicleName: 'carro elétrico',
    artigoDefinido: 'o',
    artigoIndefinido: 'um',
    pronomePossessivo: 'seu',
    generoObjeto: 'dele',
    hasTurnFeature: true,
    incomeCategories: ['Corrida', 'Gorjeta', 'Bônus', 'Outros'],
    expenseCategories: [
      'Recarga Elétrica', 'Manutenção (Pneus/Freios)', 'Limpeza', 
      'Alimentação/Água', 'Seguro', 'Parcela do Aluguel/Financiamento', 
      'Software/Assinaturas', 'Moradia', 'Contas (Luz, Água)', 'Saúde', 'Lazer', 'Outros'
    ],
    incomeSources: ['Z-EV', 'Uber', '99pop', 'inDrive', 'Particular', 'Outros'],
  },
};

export const ALL_INCOME_CATEGORIES = [...new Set([...PROFILE_CONFIG.driver.incomeCategories, ...PROFILE_CONFIG.motoboy.incomeCategories, ...PROFILE_CONFIG.zev_driver.incomeCategories])];
export const ALL_EXPENSE_CATEGORIES = [...new Set([...PROFILE_CONFIG.driver.expenseCategories, ...PROFILE_CONFIG.motoboy.expenseCategories, ...PROFILE_CONFIG.zev_driver.expenseCategories])];
export const ALL_REMINDER_TYPES = [...new Set([
  'Pagamento', 
  'Documentação', 
  'Outro', 
  ...ALL_EXPENSE_CATEGORIES
])];