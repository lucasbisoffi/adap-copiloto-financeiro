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

export async function getExpensesByCategory(userId, month) {
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

  return await Expense.aggregate([
    { $match: matchStage },
    { $group: { _id: "$category", total: { $sum: "$amount" } } },
    { $sort: { total: -1 } },
  ]);
}

export async function getIncomesBySource(userId, month) {
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

  return await Income.aggregate([
    { $match: matchStage },
    { $group: { _id: "$source", total: { $sum: "$amount" } } },
    { $sort: { total: -1 } },
  ]);
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

export async function getIncomeDetails(userId, month, monthName) {
  let matchStage = { userId };
  const [year, monthNumber] = month.split("-");
  matchStage.date = {
    $gte: new Date(Date.UTC(parseInt(year), parseInt(monthNumber) - 1, 1)),
    $lte: new Date(
      Date.UTC(parseInt(year), parseInt(monthNumber), 0, 23, 59, 59)
    ),
  };

  const incomes = await Income.find(matchStage).sort({ source: 1, date: 1 });
  if (incomes.length === 0) return "Nenhum ganho encontrado para este período.";

  let message = `🧾 *Detalhes dos Ganhos em ${monthName}*:\n\n`;
  const incomesBySource = {};
  incomes.forEach((income) => {
    const source = income.source || "Outros";
    if (!incomesBySource[source]) incomesBySource[source] = [];
    incomesBySource[source].push(
      `   💰 ${income.description}: *R$ ${income.amount.toFixed(2)}*`
    );
  });

  for (const source in incomesBySource) {
    message += `*${source}*:\n${incomesBySource[source].join("\n")}\n\n`;
  }
  return message.trim();
}

export async function getExpenseDetails(userId, month, monthName) {
  let matchStage = { userId };
  const [year, monthNumber] = month.split("-");
  matchStage.date = {
    $gte: new Date(Date.UTC(parseInt(year), parseInt(monthNumber) - 1, 1)),
    $lte: new Date(
      Date.UTC(parseInt(year), parseInt(monthNumber), 0, 23, 59, 59)
    ),
  };

  const expenses = await Expense.find(matchStage).sort({
    category: 1,
    date: 1,
  });
  if (expenses.length === 0)
    return "Nenhum gasto encontrado para este período.";

  let message = `🧾 *Detalhes dos Gastos em ${monthName}*:\n\n`;
  const expensesByCategory = {};
  expenses.forEach((expense) => {
    const cat = expense.category || "Outros";
    if (!expensesByCategory[cat]) expensesByCategory[cat] = [];
    expensesByCategory[cat].push(
      `   💸 ${expense.description}: *R$ ${expense.amount.toFixed(2)}*`
    );
  });

  for (const cat in expensesByCategory) {
    message += `*${cat}*:\n${expensesByCategory[cat].join("\n")}\n\n`;
  }
  return message.trim();
}

export async function getTotalReminders(userId) {
  const reminders = await Reminder.find({
    userId,
    reminderDate: { $gte: new Date() },
    notified: false,
  }).sort({ reminderDate: 1 });

  if (reminders.length === 0) return "";

  const typeEmoji = {
    Pagamento: "💳",
    Manutenção: "🔧",
    Documento: "📄",
    Outro: "🗓️",
  };

  return reminders
    .map((r) => {
      const dateObj = new Date(r.reminderDate);
      const formattedDate = dateObj.toLocaleDateString("pt-BR", {
        timeZone: "UTC",
      });
      return `${typeEmoji[r.type] || "🗓️"} *${r.type}:* ${
        r.description
      } - *${formattedDate}* (#${r.messageId})`;
    })
    .join("\n");
}
