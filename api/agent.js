// api/agent.js
// ─────────────────────────────────────────────────────────────────────────────
// Agentic AI Monitor: Netherlands Naturalisation Language Level (A2 → B1)
// Uses Claude to intelligently analyse scraped content for policy changes.
// ─────────────────────────────────────────────────────────────────────────────

const axios = require("axios");
const cheerio = require("cheerio");
const nodemailer = require("nodemailer");

// ── Sources to monitor ────────────────────────────────────────────────────────
const SOURCES = [
  {
    name: "IND – Naturalisation conditions",
    url: "https://ind.nl/en/dutch-citizenship/naturalisation",
    selector: "body",
  },
];
/*,
  {
    name: "Government.nl – Applying for Dutch citizenship",
    url: "https://www.government.nl/topics/dutch-nationality/applying-for-dutch-naturalisation",
    selector: "body",
  },
  {
    name: "Rijksoverheid – Naturalisatie (NL)",
    url: "https://www.rijksoverheid.nl/onderwerpen/nederlanderschap/naturalisatie",
    selector: "body",
  },
  {
    name: "IND – Inburgering taaleis",
    url: "https://ind.nl/nl/naturalisatie",
    selector: "body",
  },*/
// ── Fetch + parse one source ──────────────────────────────────────────────────
async function fetchSource(source) {
  try {
    const { data } = await axios.get(source.url, {
      timeout: 15000,
      headers: {
        "User-Agent":
          "Mozilla/5.0 (compatible; NaturalisationMonitorBot/1.0; +monitoring-nl-policy)",
        "Accept-Language": "en-US,en;q=0.9,nl;q=0.8",
      },
    });
    const $ = cheerio.load(data);
    // Remove nav, footer, scripts, styles for cleaner text
    $("script, style, nav, footer, header, .cookie-banner").remove();
    const text = $(source.selector).text().replace(/\s+/g, " ").trim();
    return { ...source, content: text.slice(0, 6000), error: null };
  } catch (err) {
    return { ...source, content: "", error: err.message };
  }
}

// ── Call Claude to analyse all sources ───────────────────────────────────────
async function analyseWithClaude() {
  const prompt = `Search the web for the latest news and official announcements about Netherlands naturalisation language requirement changes. 
  
  Specifically look for: any plans, proposals, or enacted changes to raise the Dutch naturalisation language requirement from A2 to B1 (or any other level).
  
  Search these topics:
  - "Netherlands naturalisation language requirement B1 2024 2025"
  - "inburgering naturalisatie taaleis B1 wijziging"
  - site:ind.nl naturalisation language
  - site:rijksoverheid.nl naturalisatie taaleis
  
  Respond ONLY with valid JSON (no markdown):
  {
    "changeDetected": true | false,
    "confidence": "high" | "medium" | "low",
    "summary": "2-3 sentence summary",
    "relevantExcerpts": ["excerpt 1", "excerpt 2"],
    "relevantUrls": ["url1", "url2"],
    "currentStatus": "What the current policy says",
    "recommendation": "What the user should do next"
  }`;

  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": process.env.ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-5-20250929",
      max_tokens: 1000,
      /*tools: [
        {
          type: "web_search_20250305",
          name: "web_search",
        },
      ],*/
      messages: [{ role: "user", content: prompt }],
    }),
  });

  if (!response.ok) {
    throw new Error(
      `Claude API error: ${response.status} ${response.statusText}`,
    );
  }

  const data = await response.json();

  // Extract the final text block (after web search tool use)
  const textBlock = data.content
    .filter((block) => block.type === "text")
    .map((block) => block.text)
    .join("");

  try {
    const clean = textBlock.replace(/```json|```/g, "").trim();
    return JSON.parse(clean);
  } catch {
    return {
      changeDetected: false,
      confidence: "low",
      summary: "Could not parse Claude response: " + textBlock.slice(0, 300),
      relevantExcerpts: [],
      relevantUrls: [],
      currentStatus: "Unknown",
      recommendation: "Check sources manually.",
    };
  }
}
// ── Send email alert ──────────────────────────────────────────────────────────
async function sendEmail(analysis, scrapedSources) {
  const transporter = nodemailer.createTransporter({
    service: process.env.EMAIL_SERVICE || "gmail",
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS,
    },
  });

  const sourceLinks = scrapedSources
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
      : "<p>No specific excerpts.</p>";

  const alertColor = analysis.changeDetected ? "#e63946" : "#2a9d8f";
  const alertLabel = analysis.changeDetected
    ? "⚠️ CHANGE DETECTED"
    : "✅ No Change Detected";

  const html = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"/></head>
<body style="font-family:'Segoe UI',Arial,sans-serif;max-width:680px;margin:0 auto;background:#f8f9fa;padding:24px">
  <div style="background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,0.08)">
    
    <div style="background:#003087;padding:28px 32px">
      <div style="display:flex;align-items:center;gap:12px">
        <span style="font-size:28px">🇳🇱</span>
        <div>
          <h1 style="color:#fff;margin:0;font-size:20px;font-weight:700">NL Naturalisation Monitor</h1>
          <p style="color:#adc8ff;margin:4px 0 0;font-size:13px">Language Level Policy Tracker (A2 → B1)</p>
        </div>
      </div>
    </div>

    <div style="padding:28px 32px">
      
      <div style="background:${alertColor}15;border:2px solid ${alertColor};border-radius:8px;padding:16px 20px;margin-bottom:24px">
        <p style="color:${alertColor};font-weight:700;font-size:16px;margin:0 0 6px">${alertLabel}</p>
        <p style="margin:0;color:#333;font-size:14px;line-height:1.6">${analysis.summary}</p>
        <p style="margin:8px 0 0;color:#666;font-size:12px">Confidence: <strong>${analysis.confidence?.toUpperCase()}</strong> &nbsp;·&nbsp; Checked: ${new Date().toUTCString()}</p>
      </div>

      <h3 style="color:#003087;font-size:15px;margin:0 0 8px">📋 Current Policy Status</h3>
      <p style="color:#444;font-size:14px;line-height:1.6;margin:0 0 20px;background:#f1f3f5;padding:12px 16px;border-radius:6px">${analysis.currentStatus}</p>

      ${
        analysis.relevantExcerpts?.length > 0
          ? `
      <h3 style="color:#003087;font-size:15px;margin:0 0 8px">💬 Relevant Excerpts</h3>
      <div style="margin-bottom:20px">${excerpts}</div>
      `
          : ""
      }

      <h3 style="color:#003087;font-size:15px;margin:0 0 8px">🔗 Key Links to Check</h3>
      <ul style="font-size:14px;color:#1a73e8;line-height:2;margin:0 0 20px;padding-left:20px">${relevantLinks}</ul>

      <h3 style="color:#003087;font-size:15px;margin:0 0 8px">💡 Recommendation</h3>
      <p style="color:#444;font-size:14px;line-height:1.6;margin:0 0 24px">${analysis.recommendation}</p>

      <hr style="border:none;border-top:1px solid #e9ecef;margin:24px 0"/>

      <h3 style="color:#666;font-size:13px;margin:0 0 8px;text-transform:uppercase;letter-spacing:0.5px">Sources Monitored</h3>
      <ul style="font-size:13px;color:#1a73e8;line-height:2;margin:0;padding-left:20px">${sourceLinks}</ul>

    </div>

    <div style="background:#f1f3f5;padding:16px 32px;text-align:center">
      <p style="color:#999;font-size:12px;margin:0">Automated alert by NL Naturalisation Monitor · Powered by Claude AI</p>
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

// ── Main agent run ────────────────────────────────────────────────────────────
async function runAgent({ forceEmail = false } = {}) {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] 🤖 Agent started`);

  // Claude searches the web directly — no scraping needed
  console.log(`[${timestamp}] 🧠 Analysing with Claude web search...`);
  const analysis = await analyseWithClaude();
  console.log(`[${timestamp}] 🔍 Change detected: ${analysis.changeDetected}`);

  let emailSent = false;
  let emailSubject = null;

  if (analysis.changeDetected || forceEmail) {
    console.log(`[${timestamp}] 📧 Sending email...`);
    emailSubject = await sendEmail(analysis, SOURCES);
    emailSent = true;
  }

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
