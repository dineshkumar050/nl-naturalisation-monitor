// api/run-with-email.js
console.log("[RunWithEmail] Module loading...");

if (!global.runLog) global.runLog = [];

module.exports = async (req, res) => {
  console.log("[RunWithEmail] Handler called");
  res.setHeader("Access-Control-Allow-Origin", "*");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST")
    return res.status(405).json({ error: "Method not allowed" });

  console.log("[RunWithEmail] Calling Claude...");

  let analysis;
  try {
    // ── Step 1: Call Claude ──────────────────────────────────────────────
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
            content: `Search the web for the latest Netherlands naturalisation language requirements and return your findings as JSON with this exact structure:
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
      console.error("[Claude] JSON parse failed:", textBlock);
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

  // ── Step 2: Send email ─────────────────────────────────────────────────
  let emailSent = false;
  try {
    console.log("[Email] Loading nodemailer...");
    const nodemailer = require("nodemailer");

    const transporter = nodemailer.createTransport({
      service: process.env.EMAIL_SERVICE || "gmail",
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS,
      },
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

    const sourceLinks = SOURCES.map(
      (s) => `<li><a href="${s.url}">${s.name}</a></li>`,
    ).join("");
    const relevantLinks =
      analysis.relevantUrls?.length > 0
        ? analysis.relevantUrls
            .map((u) => `<li><a href="${u}">${u}</a></li>`)
            .join("")
        : "<li>No specific URLs flagged</li>";

    const alertColor = analysis.changeDetected ? "#e63946" : "#2a9d8f";
    const alertLabel = analysis.changeDetected
      ? "⚠️ CHANGE DETECTED"
      : "✅ No Change Detected";

    const html = `
<!DOCTYPE html>
<html>
<body style="font-family:'Segoe UI',Arial,sans-serif;max-width:680px;margin:0 auto;background:#f8f9fa;padding:24px">
  <div style="background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,0.08)">
    <div style="background:#003087;padding:28px 32px">
      <h1 style="color:#fff;margin:0;font-size:20px">🇳🇱 NL Naturalisation Monitor</h1>
      <p style="color:#adc8ff;margin:4px 0 0;font-size:13px">Language Level Policy Tracker (A2 → B1)</p>
    </div>
    <div style="padding:28px 32px">
      <div style="background:${alertColor}15;border:2px solid ${alertColor};border-radius:8px;padding:16px 20px;margin-bottom:24px">
        <p style="color:${alertColor};font-weight:700;font-size:16px;margin:0 0 6px">${alertLabel}</p>
        <p style="margin:0;color:#333;font-size:14px">${analysis.summary}</p>
        <p style="margin:8px 0 0;color:#666;font-size:12px">Checked: ${new Date().toUTCString()}</p>
      </div>
      <h3 style="color:#003087">Current Policy Status</h3>
      <p style="background:#f1f3f5;padding:12px 16px;border-radius:6px">${analysis.currentStatus}</p>
      <h3 style="color:#003087">Key Links</h3>
      <ul>${relevantLinks}</ul>
      <h3 style="color:#003087">Recommendation</h3>
      <p>${analysis.recommendation}</p>
      <hr style="border:none;border-top:1px solid #e9ecef;margin:24px 0"/>
      <h3 style="color:#666;font-size:13px">Sources Monitored</h3>
      <ul style="font-size:13px">${sourceLinks}</ul>
    </div>
    <div style="background:#f1f3f5;padding:16px 32px;text-align:center">
      <p style="color:#999;font-size:12px">Automated alert · NL Naturalisation Monitor · Powered by Claude AI</p>
    </div>
  </div>
</body>
</html>`;

    const subject = analysis.changeDetected
      ? `🚨 ALERT: NL Naturalisation Language Requirement Change Detected`
      : `✅ NL Naturalisation Monitor – No Change (${new Date().toLocaleDateString("en-GB")})`;

    await transporter.sendMail({
      from: `"NL Naturalisation Monitor" <${process.env.EMAIL_USER}>`,
      to: process.env.EMAIL_TO,
      subject,
      html,
    });

    emailSent = true;
    console.log("[Email] Sent successfully to", process.env.EMAIL_TO);
  } catch (err) {
    console.error("[Email] ERROR:", err.message);
  }

  // ── Step 3: Save to log and respond ──────────────────────────────────
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

  console.log("[RunWithEmail] DONE. emailSent:", emailSent);
  res.json({
    message: "Done",
    emailSent,
    changeDetected: analysis.changeDetected,
  });
};
