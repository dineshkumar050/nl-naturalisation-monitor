// api/agent.js
const nodemailer = require("nodemailer");

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

async function analyseWithClaude() {
  console.log("[Claude] Starting analysis...");
  console.log(
    "[Claude] API key starts with:",
    process.env.ANTHROPIC_API_KEY?.slice(0, 10),
  );

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
      messages: [{ role: "user", content: "Reply with just the word WORKING" }],
    }),
  });

  console.log("[Claude] Response status:", response.status);
  const data = await response.json();
  console.log("[Claude] Reply:", data.content?.[0]?.text);

  return {
    changeDetected: false,
    confidence: "low",
    summary: "Test run — Claude replied: " + data.content?.[0]?.text,
    relevantExcerpts: [],
    relevantUrls: [],
    currentStatus: "Test mode",
    recommendation: "Test successful",
  };
}

async function sendEmail(analysis, sources) {
  const transporter = nodemailer.createTransport({
    service: process.env.EMAIL_SERVICE || "gmail",
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS,
    },
  });

  const sourceLinks = sources
    .map((s) => `<li><a href="${s.url}">${s.name}</a></li>`)
    .join("");
  const relevantLinks =
    analysis.relevantUrls?.length > 0
      ? analysis.relevantUrls
          .map((u) => `<li><a href="${u}">${u}</a></li>`)
          .join("")
      : "<li>No specific URLs flagged</li>";
  const excerpts =
    analysis.relevantExcerpts?.length > 0
      ? analysis.relevantExcerpts
          .map(
            (e) =>
              `<blockquote style="border-left:3px solid #e63946;padding-left:12px;color:#555;font-style:italic">${e}</blockquote>`,
          )
          .join("")
      : "";

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
      ${excerpts ? `<h3 style="color:#003087">Relevant Excerpts</h3>${excerpts}` : ""}
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

  return subject;
}

async function runAgent({ forceEmail = false } = {}) {
  const timestamp = new Date().toISOString();
  console.log(`[Agent] START ${timestamp}`);

  let analysis;
  try {
    analysis = await analyseWithClaude();
  } catch (err) {
    console.error(`[Agent] Claude error:`, err.message);
    analysis = {
      changeDetected: false,
      confidence: "low",
      summary: `Error: ${err.message}`,
      relevantExcerpts: [],
      relevantUrls: [],
      currentStatus: "Error during check",
      recommendation: "Check Vercel function logs",
    };
  }

  let emailSent = false;
  let emailSubject = null;

  if (analysis.changeDetected || forceEmail) {
    try {
      emailSubject = await sendEmail(analysis, SOURCES);
      emailSent = true;
      console.log(`[Agent] Email sent`);
    } catch (err) {
      console.error(`[Agent] Email error:`, err.message);
    }
  } else {
    console.log(`[Agent] No change detected, no email sent`);
  }

  console.log(`[Agent] DONE`);
  return {
    timestamp,
    sourcesChecked: SOURCES.length,
    sourcesSucceeded: SOURCES.length,
    analysis,
    emailSent,
    emailSubject,
  };
}

module.exports = { runAgent, SOURCES };
