// api/run-with-email.js
const { runAgent } = require("./agent");

if (!global.runLog) global.runLog = [];

module.exports = async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  res.json({ message: "Agent triggered with forced email." });

  try {
    const result = await runAgent({ forceEmail: true });
    global.runLog.unshift({ ...result, id: Date.now() });
    if (global.runLog.length > 20) global.runLog.pop();
  } catch (err) {
    console.error("Run-with-email error:", err.message);
    global.runLog.unshift({ timestamp: new Date().toISOString(), error: err.message, id: Date.now() });
  }
};
