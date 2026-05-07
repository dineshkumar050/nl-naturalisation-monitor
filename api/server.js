// api/server.js
require("dotenv").config();
const express = require("express");
const cors = require("cors");
const cron = require("node-cron");
const { runAgent, SOURCES } = require("./agent");

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

// ── In-memory run log (last 20 runs) ─────────────────────────────────────────
const runLog = [];
let isRunning = false;
let nextRunTime = null;
let cronJob = null;

function logRun(result) {
  runLog.unshift({ ...result, id: Date.now() });
  if (runLog.length > 20) runLog.pop();
}

// ── Schedule cron ─────────────────────────────────────────────────────────────
function startCron() {
  const schedule = process.env.CRON_SCHEDULE || "0 */6 * * *"; // every 6 hours
  if (cronJob) cronJob.stop();

  cronJob = cron.schedule(schedule, async () => {
    if (isRunning) return;
    isRunning = true;
    try {
      const result = await runAgent();
      logRun(result);
    } catch (err) {
      console.error("Cron run error:", err.message);
      logRun({ timestamp: new Date().toISOString(), error: err.message });
    } finally {
      isRunning = false;
    }
  });

  // Calculate next run for display
  const interval = parseInt((schedule.match(/\*\/(\d+)/) || [])[1] || "6");
  nextRunTime = new Date(Date.now() + interval * 60 * 60 * 1000).toISOString();
  console.log(`⏰ Cron scheduled: ${schedule} (next ~${nextRunTime})`);
}

startCron();

// ── API Routes ────────────────────────────────────────────────────────────────

// GET /api/status — dashboard status
app.get("/api/status", (req, res) => {
  const lastRun = runLog[0] || null;
  res.json({
    status: "running",
    isRunning,
    nextRunTime,
    lastRun,
    totalRuns: runLog.length,
    sources: SOURCES.map((s) => ({ name: s.name, url: s.url })),
    schedule: process.env.CRON_SCHEDULE || "0 */6 * * *",
  });
});

// GET /api/logs — run history
app.get("/api/logs", (req, res) => {
  res.json({ logs: runLog });
});

// POST /api/run — manual trigger
app.post("/api/run", async (req, res) => {
  if (isRunning) {
    return res.status(409).json({ error: "Agent is already running" });
  }
  isRunning = true;
  res.json({ message: "Agent triggered. Check /api/logs for results." });

  try {
    const forceEmail = req.body?.forceEmail === true;
    const result = await runAgent({ forceEmail });
    logRun(result);
  } catch (err) {
    console.error("Manual run error:", err.message);
    logRun({ timestamp: new Date().toISOString(), error: err.message });
  } finally {
    isRunning = false;
  }
});

// POST /api/run-with-email — manual trigger, always send email (test mode)
app.post("/api/run-with-email", async (req, res) => {
  if (isRunning) {
    return res.status(409).json({ error: "Agent is already running" });
  }
  isRunning = true;
  res.json({ message: "Agent triggered with forced email. Check /api/logs for results." });

  try {
    const result = await runAgent({ forceEmail: true });
    logRun(result);
  } catch (err) {
    logRun({ timestamp: new Date().toISOString(), error: err.message });
  } finally {
    isRunning = false;
  }
});

// GET /api/sources — list monitored sources
app.get("/api/sources", (req, res) => {
  res.json({ sources: SOURCES });
});

// Serve React build in production
if (process.env.NODE_ENV === "production") {
  const path = require("path");
  app.use(express.static(path.join(__dirname, "../build")));
  app.get("*", (req, res) => {
    res.sendFile(path.join(__dirname, "../build", "index.html"));
  });
}

app.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
  console.log(`📧 Email alerts → ${process.env.EMAIL_TO || "(not configured)"}`);
});
