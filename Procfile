web: node server.js
worker: node -e "require('./src/jobs/reminderJob.js').startReminderJob(); require('./src/jobs/turnReminderJob.js').startTurnReminderJob();"