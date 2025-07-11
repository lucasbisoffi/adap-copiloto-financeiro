import Expense from "../models/Expense.js";
import Income from "../models/Income.js";
import Reminder from "../models/Reminder.js";

export async function calculateTotalIncome(
  userId,
  month = null,
  source = null
) {
  let matchStage = { userId };
  if (source) {
    matchStage.source = { $regex: new RegExp(`^${source.trim()}$`, "i") };
  }
  if (month) {
    const [year, monthNumber] = month.split("-");
    matchStage.date = {
      $gte: new Date(Date.UTC(parseInt(year), parseInt(monthNumber) - 1, 1)),
      $lte: new Date(
        Date.UTC(parseInt(year), parseInt(monthNumber), 0, 23, 59, 59)
      ),
    };
  }
  const result = await Income.aggregate([
    { $match: matchStage },
    { $group: { _id: null, total: { $sum: "$amount" } } },
  ]);
  return result.length > 0 ? result[0].total : 0;
}
export async function calculateTotalExpenses(
  userId,
  category = null,
  month = null
) {
  let matchStage = { userId };
  if (category) {
    matchStage.category = category;
  }
  if (month) {
    const [year, monthNumber] = month.split("-");
    matchStage.date = {
      $gte: new Date(Date.UTC(parseInt(year), parseInt(monthNumber) - 1, 1)),
      $lte: new Date(
        Date.UTC(parseInt(year), parseInt(monthNumber), 0, 23, 59, 59)
      ),
    };
  }
  const result = await Expense.aggregate([
    { $match: matchStage },
    { $group: { _id: null, total: { $sum: "$amount" } } },
  ]);
  return result.length > 0 ? result[0].total : 0;
}
export async function getPeriodSummary(
  userId,
  month,
  monthName,
  source,
  category
) {
  if (source) {
    const total = await calculateTotalIncome(userId, month, source);
    return `💰 Ganhos com *${source}* em _${monthName}_: *R$ ${total.toFixed(
      2
    )}*`;
  }
  if (category) {
    const total = await calculateTotalExpenses(userId, category, month);
    return `💸 Gastos com *${category}* em _${monthName}_: *R$ ${total.toFixed(
      2
    )}*`;
  }
  const totalIncome = await calculateTotalIncome(userId, month);
  const totalExpenses = await calculateTotalExpenses(userId, null, month);
  const profit = totalIncome - totalExpenses;
  const profitEmoji = profit >= 0 ? "✅" : "❌";

  let message = `*Resumo de ${monthName}*:\n\n`;
  message += `💰 Ganhos: R$ ${totalIncome.toFixed(2)}\n`;
  message += `💸 Gastos: R$ ${totalExpenses.toFixed(2)}\n`;
  message += `----------\n`;
  message += `${profitEmoji} *Lucro: R$ ${profit.toFixed(2)}*`;

  return message;
}
export async function getProfitReportData(userId, days) {
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);
  startDate.setHours(0, 0, 0, 0);

  const incomePromise = Income.aggregate([
    { $match: { userId, date: { $gte: startDate } } },
    {
      $group: {
        _id: { $dateToString: { format: "%Y-%m-%d", date: "$date" } },
        total: { $sum: "$amount" },
      },
    },
  ]);

  const expensePromise = Expense.aggregate([
    { $match: { userId, date: { $gte: startDate } } },
    {
      $group: {
        _id: { $dateToString: { format: "%Y-%m-%d", date: "$date" } },
        total: { $sum: "$amount" },
      },
    },
  ]);

  const [incomes, expenses] = await Promise.all([
    incomePromise,
    expensePromise,
  ]);

  const dataMap = {};
  incomes.forEach((item) => {
    dataMap[item._id] = {
      ...dataMap[item._id],
      date: item._id,
      income: item.total,
    };
  });
  expenses.forEach((item) => {
    dataMap[item._id] = {
      ...dataMap[item._id],
      date: item._id,
      expense: item.total,
    };
  });

  const combinedData = Object.values(dataMap).sort(
    (a, b) => new Date(a.date) - new Date(b.date)
  );
  return combinedData;
}
export async function getTotalReminders(userId) {
  // Busca lembretes que ainda não venceram e os ordena do mais próximo para o mais distante.
  const reminders = await Reminder.find({
    userId,
    date: { $gte: new Date() },
  }).sort({ date: 1 });

  if (reminders.length === 0) {
    return ""; // Retorna vazio para a mensagem padrão ser exibida
  }

  // Formata a data e a hora para o fuso horário do Brasil.
  return reminders
    .map((r) => {
      const formattedDateTime = new Intl.DateTimeFormat("pt-BR", {
        dateStyle: "short",
        timeStyle: "short",
        timeZone: "America/Sao_Paulo",
      }).format(new Date(r.date));

      return `🗓️ *${r.description}* - ${formattedDateTime} (#${r.messageId})`;
    })
    .join("\n");
}

export async function getExpensesByCategory(userId, month, category = null) {
  const [year, monthNumber] = month.split("-");
  const matchStage = {
    userId,
    date: {
      $gte: new Date(Date.UTC(parseInt(year), parseInt(monthNumber) - 1, 1)),
      $lte: new Date(
        Date.UTC(parseInt(year), parseInt(monthNumber), 0, 23, 59, 59)
      ),
    },
  };

  // Se uma categoria específica for fornecida, adicionamos ao filtro.
  if (category) {
    matchStage.category = category;
  }

  // Se a consulta for para uma categoria específica, agrupamos por descrição para ver os itens.
  // Se for geral, agrupamos por categoria para ver os totais de cada uma.
  const groupStage = {
    _id: category ? "$description" : "$category",
    total: { $sum: "$amount" },
  };

  return await Expense.aggregate([
    { $match: matchStage },
    { $group: groupStage },
    { $sort: { total: -1 } },
  ]);
}

export async function getIncomesBySource(userId, month, source) {
  const [year, monthNum] = month.split("-").map(Number);
  const startDate = new Date(year, monthNum - 1, 1);
  const endDate = new Date(year, monthNum, 0, 23, 59, 59);

  const matchConditions = {
    userId,
    date: { $gte: startDate, $lte: endDate },
    category: "Corrida", // Focamos apenas em corridas para essa análise
  };

  if (source) {
    matchConditions.source = source;
  }

  const incomes = await Income.aggregate([
    { $match: matchConditions },
    {
      $group: {
        _id: "$source", // Agrupa por plataforma (Uber, 99, etc)
        total: { $sum: "$amount" }, // Soma o valor das corridas (já existia)
        count: { $sum: 1 }, // NOVO: Conta o número de corridas
        totalDistance: { $sum: "$distance" }, // NOVO: Soma a quilometragem
      },
    },
    { $sort: { total: -1 } }, // Ordena da mais rentável para a menos
  ]);

  return incomes;
}

export async function getIncomeDetails(userId, month, monthName, source) {
  const [year, monthNum] = month.split("-").map(Number);
  const startDate = new Date(year, monthNum - 1, 1);
  const endDate = new Date(year, monthNum, 0, 23, 59, 59);

  const matchConditions = {
    userId,
    date: { $gte: startDate, $lte: endDate },
  };

  if (source) {
    matchConditions.source = source;
  }

  const incomes = await Income.find(matchConditions).sort({ date: 1 });

  if (incomes.length === 0) {
    return `Você não tem nenhuma receita registrada em *${monthName}*.`;
  }

  let message = `🧾 *Detalhes dos Ganhos em ${monthName}*:\n\n`;
  const groupedIncomes = {};

  incomes.forEach((inc) => {
    if (!groupedIncomes[inc.source]) {
      groupedIncomes[inc.source] = [];
    }
    groupedIncomes[inc.source].push(inc);
  });

  for (const sourceName in groupedIncomes) {
    message += `*${sourceName}*:\n`; // Mantém a plataforma em negrito
    groupedIncomes[sourceName].forEach((inc) => {
      let itemText;
      if (inc.category === "Corrida" && inc.distance) {
        // Formato para corridas
        itemText = `R$ ${inc.amount.toFixed(2)} [${inc.distance} km]`;
      } else {
        // Formato para outros ganhos (ex: Gorjeta)
        itemText = `${inc.description}: R$ ${inc.amount.toFixed(2)}`;
      }
      // Adiciona o emoji e a formatação monoespaçada
      message += `💰 \`\`\`${itemText}\`\`\`\n`;
    });
    message += `\n`;
  }

  return message.trim();
}

export async function getExpenseDetails(
  userId,
  month,
  monthName,
  category = null
) {
  let matchStage = { userId };
  const [year, monthNumber] = month.split("-");
  matchStage.date = {
    $gte: new Date(Date.UTC(parseInt(year), parseInt(monthNumber) - 1, 1)),
    $lte: new Date(
      Date.UTC(parseInt(year), parseInt(monthNumber), 0, 23, 59, 59)
    ),
  };

  if (category) {
    matchStage.category = category;
  }

  // Busca os documentos completos de despesa
  const expenses = await Expense.find(matchStage).sort({
    category: 1,
    date: 1,
  });

  if (expenses.length === 0)
    return `Nenhum gasto encontrado em *${monthName}* ${
      category ? `na categoria *${category}*` : ""
    }.`;

  let message = `🧾 *Detalhes dos Gastos em ${monthName}${
    category ? ` (${category})` : ""
  }*:\n\n`;
    
  const expensesByCategory = {};
  
  // Agrupa os OBJETOS de despesa por categoria, não o texto formatado.
  expenses.forEach((expense) => {
    const groupKey = expense.category || "Outros";
    if (!expensesByCategory[groupKey]) {
      expensesByCategory[groupKey] = [];
    }
    // AQUI ESTAVA O PROBLEMA: Agora estamos adicionando o objeto completo.
    expensesByCategory[groupKey].push(expense);
  });

  // Itera sobre as categorias e os objetos de despesa para formatar a saída.
  for (const groupKey in expensesByCategory) {
    message += `📁 *${groupKey}*:\n`;
    expensesByCategory[groupKey].forEach(expenseItem => {
      // Agora 'expenseItem' é o objeto de despesa, com '.amount', '.description', etc.
      const itemText = `${expenseItem.description}: R$ ${expenseItem.amount.toFixed(2)} (#${expenseItem.messageId})`;
      message += `  💸 \`\`\`${itemText}\`\`\`\n`;
    });
    message += `\n`;
  }

  return message.trim();
}

export async function getPeriodReport(userId, { period, month }) {
  const now = new Date();
  let startDate, endDate, title;

  if (month) {
    // Lógica para mês específico (ex: "junho")
    const [year, monthNumber] = month.split('-').map(Number);
    startDate = new Date(year, monthNumber - 1, 1);
    endDate = new Date(year, monthNumber, 0, 23, 59, 59);
    title = startDate.toLocaleString('pt-BR', { month: 'long', year: 'numeric' });
    // Capitaliza o nome do mês
    title = title.charAt(0).toUpperCase() + title.slice(1);
    
  } else {
    // Lógica para períodos relativos (hoje, semana)
    endDate = new Date(now);
    switch (period) {
      case 'today':
        startDate = new Date(now.setHours(0, 0, 0, 0));
        endDate.setHours(23, 59, 59, 999);
        title = 'de Hoje';
        break;
      case 'week':
      default: // Padrão é semana
        startDate = new Date(now.setDate(now.getDate() - 7));
        startDate.setHours(0, 0, 0, 0);
        title = 'da Última Semana';
        break;
    }
  }

  const matchStage = { userId, date: { $gte: startDate, $lte: endDate } };

  // O resto da lógica de agregação permanece o mesmo
  const incomePromise = Income.aggregate([
    { $match: matchStage },
    { $group: { 
        _id: null, 
        total: { $sum: "$amount" },
        count: { $sum: 1 },
        totalDistance: { $sum: "$distance" }
    }}
  ]);

  const expensePromise = Expense.aggregate([
    { $match: matchStage },
    { $group: { 
        _id: null, 
        total: { $sum: "$amount" },
        count: { $sum: 1 }
    }}
  ]);

  const [incomeResult, expenseResult] = await Promise.all([incomePromise, expensePromise]);
  
  const incomeData = incomeResult[0] || { total: 0, count: 0, totalDistance: 0 };
  const expenseData = expenseResult[0] || { total: 0, count: 0 };

  return {
    title: title, // Passamos um título dinâmico para a mensagem
    totalIncome: incomeData.total,
    incomeCount: incomeData.count,
    totalDistance: incomeData.totalDistance,
    totalExpenses: expenseData.total,
    expenseCount: expenseData.count,
    profit: incomeData.total - expenseData.total,
  };
}