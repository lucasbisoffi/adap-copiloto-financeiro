export const ZEV_CONFIG = {
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
    // Operacional
    'Recarga Elétrica',
    'Manutenção (Pneus/Freios)',
    'Manutenção Corretiva',
    'Manutenção Preventiva',
    'Limpeza e Estética',
    'Acessórios e Equipamentos',
    'Software/Assinaturas do Veículo',
    // Documentação e Taxas
    'Seguro',
    'Parcela do Aluguel/Financiamento',
    'IPVA e Licenciamento',
    'Multas',
    'Pedágio',
    'Estacionamento',
    // Despesas do Motorista
    'Alimentação/Água',
    'Plano de Celular/Internet',
    'Contabilidade/MEI',
    // Despesas Gerais (Fora do carro)
    'Moradia (Aluguel, Condomínio)',
    'Contas (Água, Luz, Gás)',
    'Educação',
    'Saúde (Plano, Farmácia)',
    'Lazer e Entretenimento',
    'Compras Pessoais',
    // Categoria Padrão
    'Outros',
  ],
  incomeSources: ['Z-EV', 'Uber', '99pop', 'inDrive', 'Particular', 'Outros'],
};

export const ALL_INCOME_CATEGORIES = [...ZEV_CONFIG.incomeCategories];
export const ALL_EXPENSE_CATEGORIES = [...ZEV_CONFIG.expenseCategories];
export const ALL_REMINDER_TYPES = [...new Set([
  'Pagamento', 
  'Documentação', 
  'Outro', 
  ...ALL_EXPENSE_CATEGORIES
])];