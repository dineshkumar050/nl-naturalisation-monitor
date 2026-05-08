// api/test-claude.js — temporary test endpoint
module.exports = async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");

  console.log("[Test] Starting...");
  console.log("[Test] Key:", process.env.ANTHROPIC_API_KEY?.slice(0, 14));

  try {
    console.log("[Test] Calling Claude...");

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

    console.log("[Test] Status:", response.status);
    const data = await response.json();
    console.log("[Test] Reply:", data.content?.[0]?.text);

    res.json({
      success: true,
      reply: data.content?.[0]?.text,
      status: response.status,
    });
  } catch (err) {
    console.error("[Test] ERROR:", err.message);
    res.json({ success: false, error: err.message });
  }
};
