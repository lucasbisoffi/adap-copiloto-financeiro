
web: node server.js


release: python3 -m pip install -r requirements.txt

worker: node -e "require('./src/jobs/reminderJob.js').startReminderJob(); require('./src/jobs/turnReminderJob.js').startTurnReminderJob();"