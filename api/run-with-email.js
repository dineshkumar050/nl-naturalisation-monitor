// api/run-with-email.js
console.log("[RunWithEmail] Module loading...");

if (!global.runLog) global.runLog = [];

module.exports = async (req, res) => {
  console.log("[RunWithEmail] Handler called");
  res.setHeader("Access-Control-Allow-Origin", "*");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST")
    return res.status(405).json({ error: "Method not allowed" });

  // DON'T respond yet — do Claude first
  console.log("[RunWithEmail] Calling Claude...");

  try {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": process.env.ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 100,
        messages: [
          { role: "user", content: "Reply with just the word WORKING" },
        ],
      }),
    });

    console.log("[RunWithEmail] Claude status:", response.status);
    const data = await response.json();
    console.log("[RunWithEmail] Claude reply:", data.content?.[0]?.text);

    global.runLog.unshift({
      id: Date.now(),
      timestamp: new Date().toISOString(),
      analysis: {
        changeDetected: false,
        confidence: "low",
        summary: "Test: Claude replied " + data.content?.[0]?.text,
        relevantExcerpts: [],
        relevantUrls: [],
        currentStatus: "Test mode",
        recommendation: "Test successful",
      },
      emailSent: false,
    });

    // respond AFTER Claude is done
    res.json({ message: "Done", reply: data.content?.[0]?.text });
  } catch (err) {
    console.error("[RunWithEmail] ERROR:", err.message);
    global.runLog.unshift({
      id: Date.now(),
      timestamp: new Date().toISOString(),
      error: err.message,
    });
    res.json({ error: err.message });
  }
};
