// api/run.js
console.log("[Run] Module loading...");

if (!global.runLog) global.runLog = [];

module.exports = async (req, res) => {
  console.log("[Run] Handler called");
  res.setHeader("Access-Control-Allow-Origin", "*");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST")
    return res.status(405).json({ error: "Method not allowed" });

  console.log("[Run] Calling Claude...");

  let analysis;
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
        max_tokens: 1000, // increase from 500 — web search needs more tokens
        tools: [
          {
            type: "web_search_20250305",
            name: "web_search",
          },
        ],
        messages: [
          {
            role: "user",
            content: `I dont want any additional text in front of the JSON like Example : Here is the JSON requested like that. Search the web for the latest Netherlands naturalisation language requirements and return your findings as JSON with this exact structure:
{
  "changeDetected": boolean,
  "confidence": "low" | "medium" | "high",
  "summary": "2-3 sentence summary",
  "relevantUrls": ["url1", "url2"],
  "currentStatus": "string",
  "recommendation": "string"
}`,
          },
        ],
      }),
    });

    console.log("[Claude] Response status:", response.status);

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Claude API ${response.status}: ${errText}`);
    }

    const data = await response.json();

    // With web search, content has multiple blocks:
    // [{ type: "tool_use" }, { type: "tool_result" }, { type: "text", text: "{json...}" }]
    // We only want the final text block
    const textBlock = data.content
      .filter((b) => b.type === "text")
      .map((b) => b.text)
      .join("");

    console.log("[Claude] Output:", textBlock.slice(0, 200));

    try {
      const clean = textBlock.replace(/```json|```/g, "").trim();
      analysis = JSON.parse(clean);
      console.log(
        "[Claude] Parsed OK. changeDetected:",
        analysis.changeDetected,
      );
    } catch {
      analysis = {
        changeDetected: false,
        confidence: "low",
        summary: "Could not parse Claude response: " + textBlock.slice(0, 200),
        relevantExcerpts: [],
        relevantUrls: [],
        currentStatus: "Unknown",
        recommendation: "Check Vercel logs",
      };
    }
  } catch (err) {
    console.error("[Claude] ERROR:", err.message);
    analysis = {
      changeDetected: false,
      confidence: "low",
      summary: `Claude error: ${err.message}`,
      relevantExcerpts: [],
      relevantUrls: [],
      currentStatus: "Error during check",
      recommendation: "Check Vercel function logs",
    };
  }

  // Only send email if change detected (no forceEmail here)
  let emailSent = false;
  if (analysis.changeDetected) {
    try {
      console.log("[Email] Change detected — sending alert...");
      const nodemailer = require("nodemailer");
      const transporter = nodemailer.createTransport({
        service: process.env.EMAIL_SERVICE || "gmail",
        auth: { user: process.env.EMAIL_USER, pass: process.env.EMAIL_PASS },
      });

      const SOURCES = [
        {
          name: "IND – Naturalisation conditions",
          url: "https://ind.nl/en/dutch-citizenship/naturalisation",
        },
        {
          name: "Government.nl – Dutch citizenship",
          url: "https://www.government.nl/topics/dutch-nationality/applying-for-dutch-naturalisation",
        },
        {
          name: "Rijksoverheid – Naturalisatie",
          url: "https://www.rijksoverheid.nl/onderwerpen/nederlanderschap/naturalisatie",
        },
      ];

      const relevantLinks =
        analysis.relevantUrls?.length > 0
          ? analysis.relevantUrls
              .map((u) => `<li><a href="${u}">${u}</a></li>`)
              .join("")
          : "<li>No specific URLs flagged</li>";

      const html = `
<!DOCTYPE html>
<html>
<body style="font-family:'Segoe UI',Arial,sans-serif;max-width:680px;margin:0 auto;background:#f8f9fa;padding:24px">
  <div style="background:#fff;border-radius:12px;overflow:hidden">
    <div style="background:#003087;padding:28px 32px">
      <h1 style="color:#fff;margin:0;font-size:20px">🇳🇱 NL Naturalisation Monitor</h1>
    </div>
    <div style="padding:28px 32px">
      <div style="background:#e6394615;border:2px solid #e63946;border-radius:8px;padding:16px 20px;margin-bottom:24px">
        <p style="color:#e63946;font-weight:700;font-size:16px;margin:0 0 6px">⚠️ CHANGE DETECTED</p>
        <p style="margin:0;color:#333;font-size:14px">${analysis.summary}</p>
      </div>
      <h3 style="color:#003087">Current Status</h3>
      <p>${analysis.currentStatus}</p>
      <h3 style="color:#003087">Key Links</h3>
      <ul>${relevantLinks}</ul>
      <h3 style="color:#003087">Recommendation</h3>
      <p>${analysis.recommendation}</p>
      <hr style="border:none;border-top:1px solid #e9ecef;margin:24px 0"/>
      <ul style="font-size:13px">${SOURCES.map((s) => `<li><a href="${s.url}">${s.name}</a></li>`).join("")}</ul>
    </div>
  </div>
</body>
</html>`;

      await transporter.sendMail({
        from: `"NL Naturalisation Monitor" <${process.env.EMAIL_USER}>`,
        to: process.env.EMAIL_TO,
        subject: `🚨 ALERT: NL Naturalisation Language Requirement Change Detected`,
        html,
      });

      emailSent = true;
      console.log("[Email] Alert sent");
    } catch (err) {
      console.error("[Email] ERROR:", err.message);
    }
  } else {
    console.log("[Run] No change detected, no email sent");
  }

  const result = {
    id: Date.now(),
    timestamp: new Date().toISOString(),
    analysis,
    emailSent,
    sourcesChecked: 3,
    sourcesSucceeded: 3,
  };

  global.runLog.unshift(result);
  if (global.runLog.length > 20) global.runLog.pop();

  console.log("[Run] DONE");
  res.json({
    message: "Done",
    emailSent,
    changeDetected: analysis.changeDetected,
  });
};
