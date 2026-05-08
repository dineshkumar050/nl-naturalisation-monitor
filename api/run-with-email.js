// api/run-with-email.js
console.log("[RunWithEmail] Module loading...");
const { runAgent } = require("./agent");
console.log("[RunWithEmail] Agent loaded OK");

if (!global.runLog) global.runLog = [];

module.exports = async (req, res) => {
  console.log("[RunWithEmail] Handler called");
  res.setHeader("Access-Control-Allow-Origin", "*");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST")
    return res.status(405).json({ error: "Method not allowed" });

  res.json({ message: "Agent triggered with forced email." });

  console.log("[RunWithEmail] Calling runAgent...");
  try {
    const result = await runAgent({ forceEmail: true });
    console.log("[RunWithEmail] runAgent completed");
    global.runLog.unshift({ ...result, id: Date.now() });
    if (global.runLog.length > 20) global.runLog.pop();
  } catch (err) {
    console.error("[RunWithEmail] ERROR:", err.message);
    console.error("[RunWithEmail] STACK:", err.stack);
    global.runLog.unshift({
      timestamp: new Date().toISOString(),
      error: err.message,
      id: Date.now(),
    });
  }
};
