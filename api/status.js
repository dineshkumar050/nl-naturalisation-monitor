// api/status.js
const { SOURCES } = require("./agent");

if (!global.runLog) global.runLog = [];

module.exports = (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.json({
    status: "running",
    isRunning: false,
    lastRun: global.runLog[0] || null,
    totalRuns: global.runLog.length,
    sources: SOURCES.map((s) => ({ name: s.name, url: s.url })),
    schedule: process.env.CRON_SCHEDULE || "0 */6 * * *",
  });
};
