// api/server.js — LOCAL DEVELOPMENT ONLY, not used by Vercel
require("dotenv").config();
const express = require("express");
const cors = require("cors");
const cron = require("node-cron");
const { runAgent, SOURCES } = require("./agent");

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

const runLog = [];
let isRunning = false;

function logRun(result) {
  runLog.unshift({ ...result, id: Date.now() });
  if (runLog.length > 20) runLog.pop();
}

const schedule = process.env.CRON_SCHEDULE || "0 */6 * * *";
cron.schedule(schedule, async () => {
  if (isRunning) return;
  isRunning = true;
  try {
    const result = await runAgent();
    logRun(result);
  } catch (err) {
    console.error("Cron error:", err.message);
  } finally {
    isRunning = false;
  }
});

app.get("/api/status", (req, res) => {
  res.json({ status: "running", isRunning, lastRun: runLog[0] || null, totalRuns: runLog.length, sources: SOURCES, schedule });
});

app.get("/api/logs", (req, res) => {
  res.json({ logs: runLog });
});

app.get("/api/sources", (req, res) => {
  res.json({ sources: SOURCES });
});

app.post("/api/run", async (req, res) => {
  if (isRunning) return res.status(409).json({ error: "Already running" });
  isRunning = true;
  res.json({ message: "Agent triggered." });
  try {
    logRun(await runAgent({ forceEmail: false }));
  } catch (err) {
    logRun({ timestamp: new Date().toISOString(), error: err.message });
  } finally {
    isRunning = false;
  }
});

app.post("/api/run-with-email", async (req, res) => {
  if (isRunning) return res.status(409).json({ error: "Already running" });
  isRunning = true;
  res.json({ message: "Agent triggered with forced email." });
  try {
    logRun(await runAgent({ forceEmail: true }));
  } catch (err) {
    logRun({ timestamp: new Date().toISOString(), error: err.message });
  } finally {
    isRunning = false;
  }
});

const path = require("path");
app.use(express.static(path.join(__dirname, "../build")));
app.get("*", (req, res) => res.sendFile(path.join(__dirname, "../build", "index.html")));

app.listen(PORT, () => console.log(`🚀 Local server: http://localhost:${PORT}`));
