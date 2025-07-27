// src/utils/categories.js

/**
 * Objeto de configuração central para cada perfil de usuário.
 * Contém todas as listas de categorias e fontes específicas para motoristas e motoboys.
 */
export const PROFILE_CONFIG = {
  driver: {
    name: 'Motorista',
    emoji: '🚗',
    incomeTerm: 'Corrida',
    incomeExample: 'ganhei 55 na uber em 15km',
    expenseExample: '45 na troca de óleo',
    vehicleName: 'carro',
    // >> NOVAS VARIÁVEIS DE GÊNERO <<
    artigoDefinido: 'o',      // "o" carro
    artigoIndefinido: 'um',   // "um" carro
    pronomePossessivo: 'seu', // "seu" carro
    generoObjeto: 'dele',     // "marca dele"
    incomeCategories: ['Corrida', 'Gorjeta', 'Bônus', 'Outros'],
    expenseCategories: [
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
      'Outros',
    ],
    incomeSources: [
      'Uber', '99', 'InDrive', 'UBRA', 'Garupa', 'Rota 77',
      'Guri', 'Mais Próximo', 'Particular', 'Outros',
    ],
  },
  motoboy: {
    name: 'Entregador',
    emoji: '🏍️',
    incomeTerm: 'Entrega',
    incomeExample: '15 numa entrega do ifood',
    expenseExample: '50 na relação da moto',
    vehicleName: 'moto',
    // >> NOVAS VARIÁVEIS DE GÊNERO <<
    artigoDefinido: 'a',      // "a" moto
    artigoIndefinido: 'uma',   // "uma" moto
    pronomePossessivo: 'sua', // "sua" moto
    generoObjeto: 'dela',     // "marca dela"
    incomeCategories: ['Entrega', 'Gorjeta', 'Bônus', 'Outros'],
    expenseCategories: [
      'Manutenção da Moto',
      'Combustível',
      'Acessórios',
      'Aluguel da Moto',
      'Documentação da Moto',
      'Plano de Celular',
      'Alimentação',
      'Limpeza',
      'Outros',
    ],
    incomeSources: [
      'iFood', 'Rappi', 'Loggi', 'Lalamove', 'James',
      'Entrega Particular', 'Outros',
    ],
  },
  zev_driver: {
    name: 'Motorista Z-EV',
    emoji: '⚡',
    incomeTerm: 'Corrida',
    incomeExample: 'ganhei 60 na z-ev em 20km',
    expenseExample: '35 na recarga',
    vehicleName: 'carro elétrico',
    artigoDefinido: 'o',
    artigoIndefinido: 'um',
    pronomePossessivo: 'seu',
    generoObjeto: 'dele',
    incomeCategories: ['Corrida', 'Gorjeta', 'Bônus', 'Outros'],
    expenseCategories: [
      'Recarga Elétrica', 'Manutenção (Pneus/Freios)', 'Limpeza', 
      'Alimentação/Água', 'Seguro', 'Parcela do Aluguel/Financiamento', 
      'Software/Assinaturas', 'Outros'
    ],
    incomeSources: ['Z-EV', 'Uber', '99', 'Particular', 'Outros'],
  },
};

/**
 * Listas combinadas de TODAS as categorias e tipos possíveis.
 * Usadas nos schemas do Mongoose para validação (enum), permitindo que qualquer
 * categoria de qualquer perfil seja salva no banco de dados.
 * O Set garante que não haverá valores duplicados.
 */
export const ALL_INCOME_CATEGORIES = [...new Set([...PROFILE_CONFIG.driver.incomeCategories, ...PROFILE_CONFIG.motoboy.incomeCategories, ...PROFILE_CONFIG.zev_driver.incomeCategories])];
export const ALL_EXPENSE_CATEGORIES = [...new Set([...PROFILE_CONFIG.driver.expenseCategories, ...PROFILE_CONFIG.motoboy.expenseCategories, ...PROFILE_CONFIG.zev_driver.expenseCategories])];
export const ALL_REMINDER_TYPES = [...new Set([
  'Pagamento', 
  'Documentação', 
  'Outro', 
  ...ALL_EXPENSE_CATEGORIES // Agora ele "espalha" as categorias de gasto dentro deste array
])];

// As suas exportações legadas que podem ser removidas no futuro
// quando todo o código for refatorado para usar PROFILE_CONFIG.
export const INCOME_CATEGORIES = ['Corrida', 'Gorjeta', 'Bônus'];
export const EXPENSE_CATEGORIES = [
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
  'Outros',
];