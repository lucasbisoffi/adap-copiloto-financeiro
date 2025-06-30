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

export async function getIncomesBySource(userId, month, source = null) {
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

  // Se uma fonte específica for fornecida, adicionamos ao filtro.
  if (source) {
    matchStage.source = source;
  }

  // Se a consulta for para uma fonte específica, agrupamos por descrição.
  // Se for geral, agrupamos por fonte.
  const groupStage = {
    _id: source ? "$description" : "$source",
    total: { $sum: "$amount" },
  };

  return await Income.aggregate([
    { $match: matchStage },
    { $group: groupStage },
    { $sort: { total: -1 } },
  ]);
}

export async function getIncomeDetails(userId, month, monthName, source = null) {
  let matchStage = { userId };
  const [year, monthNumber] = month.split("-");
  matchStage.date = {
    $gte: new Date(Date.UTC(parseInt(year), parseInt(monthNumber) - 1, 1)),
    $lte: new Date(
      Date.UTC(parseInt(year), parseInt(monthNumber), 0, 23, 59, 59)
    ),
  };

  // Adiciona o filtro de fonte, se fornecido.
  if (source) {
    matchStage.source = source;
  }

  const incomes = await Income.find(matchStage).sort({ source: 1, date: 1 });
  if (incomes.length === 0)
    return `Nenhum ganho encontrado em *${monthName}* ${
      source ? `da plataforma *${source}*` : ""
    }.`;

  let message = `🧾 *Detalhes dos Ganhos em ${monthName}${
    source ? ` (${source})` : ""
  }*:\n\n`;
  const incomesBySource = {};
  incomes.forEach((income) => {
    const groupKey = income.source || "Outros";
    if (!incomesBySource[groupKey]) incomesBySource[groupKey] = [];
    incomesBySource[groupKey].push(
      `   💰 ${income.description}: *R$ ${income.amount.toFixed(2)}*`
    );
  });

  for (const groupKey in incomesBySource) {
    // Se a consulta já era para uma fonte específica, não precisamos repetir o título.
    if (!source) {
      message += `*${groupKey}*:\n`;
    }
    message += `${incomesBySource[groupKey].join("\n")}\n\n`;
  }
  return message.trim();
}

export async function getExpenseDetails(userId, month, monthName, category = null) {
  let matchStage = { userId };
  const [year, monthNumber] = month.split("-");
  matchStage.date = {
    $gte: new Date(Date.UTC(parseInt(year), parseInt(monthNumber) - 1, 1)),
    $lte: new Date(
      Date.UTC(parseInt(year), parseInt(monthNumber), 0, 23, 59, 59)
    ),
  };

  // Adiciona o filtro de categoria, se fornecido.
  if (category) {
    matchStage.category = category;
  }

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
  expenses.forEach((expense) => {
    const groupKey = expense.category || "Outros";
    if (!expensesByCategory[groupKey]) expensesByCategory[groupKey] = [];
    expensesByCategory[groupKey].push(
      `   💸 ${expense.description}: *R$ ${expense.amount.toFixed(2)}*`
    );
  });

  for (const groupKey in expensesByCategory) {
    if (!category) {
      message += `*${groupKey}*:\n`;
    }
    message += `${expensesByCategory[groupKey].join("\n")}\n\n`;
  }
  return message.trim();
}