import Expense from "../models/Expense.js";
import Income from "../models/Income.js";
import Reminder from "../models/Reminder.js";

export async function getTotalReminders(userId) {
  const reminders = await Reminder.find({
    userId,
    date: { $gte: new Date() },
  }).sort({ date: 1 });

  if (reminders.length === 0) {
    return "";
  }

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
    message += `*${sourceName}*:\n`;
    groupedIncomes[sourceName].forEach((inc) => {
      let itemText = `${inc.description}: R$ ${inc.amount.toFixed(2)}`;
      if (inc.category === "Corrida" && inc.count > 0) {
        itemText = `R$ ${inc.amount.toFixed(2)} [${inc.count} corridas] (#${inc.messageId})`;
      } else {
        itemText = `${inc.description}: R$ ${inc.amount.toFixed(2)} (#${inc.messageId})`;
      }
      message += `💰 \`\`\`${itemText}\`\`\`\n`;
    });
    message += `\n`;
  }

  return message.trim();
}

export async function getExpenseDetails(userId, month, monthName, category = null) {
    const [year, monthNumber] = month.split("-");
    const matchStage = {
      userId,
      date: {
        $gte: new Date(Date.UTC(parseInt(year), parseInt(monthNumber) - 1, 1)),
        $lte: new Date(Date.UTC(parseInt(year), parseInt(monthNumber), 0, 23, 59, 59)),
      },
    };

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
    if (!expensesByCategory[groupKey]) {
      expensesByCategory[groupKey] = [];
    }
    expensesByCategory[groupKey].push(expense);
  });

  for (const groupKey in expensesByCategory) {
    message += `📁 *${groupKey}*:\n`;
    expensesByCategory[groupKey].forEach(expenseItem => {
      const itemText = `${expenseItem.description}: R$ ${expenseItem.amount.toFixed(2)} (#${expenseItem.messageId})`;
      message += `  💸 \`\`\`${itemText}\`\`\`\n`;
    });
    message += `\n`;
  }

  return message.trim();
}

export async function getIncomesBySource(userId, month, source) {
  const [year, monthNum] = month.split("-").map(Number);
  const startDate = new Date(year, monthNum - 1, 1);
  const endDate = new Date(year, monthNum, 0, 23, 59, 59);

  const matchConditions = {
    userId,
    date: { $gte: startDate, $lte: endDate },
    category: "Corrida",
  };

  if (source) {
    matchConditions.source = source;
  }

  return await Income.aggregate([
    { $match: matchConditions },
    {
      $group: {
        _id: "$source",
        total: { $sum: "$amount" },
        count: { $sum: "$count" }, 
      },
    },
    { $sort: { total: -1 } },
  ]);
}

export async function getExpensesByCategory(userId, month, category = null ) {
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

  if (category) {
    matchStage.category = category;
  }

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

export async function getProfitReportData(userId, days ) {
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);
  startDate.setHours(0, 0, 0, 0);

  const matchStage = { userId, date: { $gte: startDate } };

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

export async function getPeriodReport(userId, { period, month, monthName }) {
  const now = new Date();
  let startDate, endDate, title;

  if (month) {
    const year = now.getFullYear();
    const monthNumber = parseInt(month, 10);

    startDate = new Date(Date.UTC(year, monthNumber - 1, 1));
    endDate = new Date(Date.UTC(year, monthNumber, 0, 23, 59, 59));
    
    const monthNameCapitalized = monthName.charAt(0).toUpperCase() + monthName.slice(1);
    title = `${monthNameCapitalized} de ${year}`;
    
  } else {
    endDate = new Date(now);
    switch (period) {
      case 'today':
        startDate = new Date(new Date().setHours(0, 0, 0, 0));
        title = 'de Hoje';
        break;
      case 'month':
        startDate = new Date(now.getFullYear(), now.getMonth(), 1);
        title = now.toLocaleString('pt-BR', { month: 'long' });
        title = 'de ' + title.charAt(0).toUpperCase() + title.slice(1);
        break;
      case 'week':
      default:
        startDate = new Date(new Date().setDate(now.getDate() - 7));
        startDate.setHours(0, 0, 0, 0);
        title = 'da Última Semana';
        break;
    }
  }
  
  const matchStage = { userId, date: { $gte: startDate, $lte: endDate } };

  const incomePromise = Income.aggregate([
    { $match: matchStage },
    { 
      $group: { 
        _id: null, 
        total: { $sum: "$amount" }, 
        count: { $sum: { $ifNull: ["$count", 1] } } 
      } 
    }
  ]);

  const expensePromise = Expense.aggregate([
    { $match: matchStage },
    { $group: { _id: null, total: { $sum: "$amount" }, count: { $sum: 1 } } }
  ]);

  const [incomeResult, expenseResult] = await Promise.all([incomePromise, expensePromise]);
  
  const incomeData = incomeResult[0] || { total: 0, count: 0 };
  const expenseData = expenseResult[0] || { total: 0, count: 0 };

  return {
    title: title,
    totalIncome: incomeData.total,
    incomeCount: incomeData.count,
    totalExpenses: expenseData.total,
    expenseCount: expenseData.count,
    profit: incomeData.total - expenseData.total,
  };
}