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
async function analyseWithClaude(scrapedSources) {
  console.log("[Claude] 1. Building prompt...");

  const sourceSummaries = scrapedSources
    .map(
      (s, i) =>
        `SOURCE ${i + 1}: ${s.name}\nURL: ${s.url}\n${s.error ? `ERROR: ${s.error}` : `CONTENT:\n${s.content}`}`,
    )
    .join("\n\n---\n\n");

  const prompt = `You are monitoring Dutch naturalisation policy. Has the Netherlands announced any change to raise the language requirement from A2 to B1?

${sourceSummaries}

Respond ONLY with this exact JSON, no other text:
{"changeDetected":false,"confidence":"low","summary":"test","relevantExcerpts":[],"relevantUrls":[],"currentStatus":"unknown","recommendation":"check manually"}`;

  console.log("[Claude] 2. Prompt built, length:", prompt.length);
  console.log("[Claude] 3. API key exists:", !!process.env.ANTHROPIC_API_KEY);
  console.log("[Claude] 4. Calling fetch...");

  let response;
  try {
    response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": process.env.ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 300,
        messages: [{ role: "user", content: prompt }],
      }),
    });
    console.log("[Claude] 5. Got response, status:", response.status);
  } catch (fetchErr) {
    console.error("[Claude] 5. FETCH THREW ERROR:", fetchErr.message);
    throw fetchErr;
  }

  if (!response.ok) {
    const errText = await response.text();
    console.error("[Claude] 6. Non-OK response body:", errText);
    throw new Error(`Claude API ${response.status}: ${errText}`);
  }

  console.log("[Claude] 6. Parsing response JSON...");
  let data;
  try {
    data = await response.json();
    console.log("[Claude] 7. Parsed OK, stop_reason:", data.stop_reason);
    console.log("[Claude] 8. Content blocks:", data.content?.length);
  } catch (parseErr) {
    console.error("[Claude] 7. JSON PARSE ERROR:", parseErr.message);
    throw parseErr;
  }

  const textBlock = data.content
    .filter((b) => b.type === "text")
    .map((b) => b.text)
    .join("");

  console.log("[Claude] 9. Text output:", textBlock.slice(0, 200));

  try {
    const clean = textBlock.replace(/```json|```/g, "").trim();
    const parsed = JSON.parse(clean);
    console.log(
      "[Claude] 10. JSON parsed OK, changeDetected:",
      parsed.changeDetected,
    );
    return parsed;
  } catch {
    console.error("[Claude] 10. JSON PARSE FAILED, raw text:", textBlock);
    return {
      changeDetected: false,
      confidence: "low",
      summary: "Parse error: " + textBlock.slice(0, 200),
      relevantExcerpts: [],
      relevantUrls: [],
      currentStatus: "Unknown",
      recommendation: "Check logs",
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
  console.log(`[Agent] START ${timestamp}`);

  console.log(`[Agent] Scraping sources...`);
  let scrapedSources;
  try {
    scrapedSources = await Promise.all(SOURCES.map(fetchSource));
    console.log(
      `[Agent] Scraped ${scrapedSources.filter((s) => !s.error).length}/${scrapedSources.length} sources`,
    );
    scrapedSources.forEach((s) => {
      if (s.error) console.error(`[Agent] Scrape error ${s.name}: ${s.error}`);
      else console.log(`[Agent] Scraped ${s.name}: ${s.content.length} chars`);
    });
  } catch (scrapeErr) {
    console.error(`[Agent] SCRAPE THREW:`, scrapeErr.message);
    scrapedSources = SOURCES.map((s) => ({
      ...s,
      content: "",
      error: scrapeErr.message,
    }));
  }

  console.log(`[Agent] Calling Claude...`);
  let analysis;
  try {
    analysis = await analyseWithClaude(scrapedSources);
    console.log(
      `[Agent] Claude done. changeDetected=${analysis.changeDetected}`,
    );
  } catch (claudeErr) {
    console.error(`[Agent] CLAUDE THREW:`, claudeErr.message);
    analysis = {
      changeDetected: false,
      confidence: "low",
      summary: `Claude error: ${claudeErr.message}`,
      relevantExcerpts: [],
      relevantUrls: [],
      currentStatus: "Error",
      recommendation: "Check logs",
    };
  }

  let emailSent = false;
  let emailSubject = null;

  if (analysis.changeDetected || forceEmail) {
    console.log(`[Agent] Sending email...`);
    try {
      emailSubject = await sendEmail(analysis, scrapedSources);
      emailSent = true;
      console.log(`[Agent] Email sent: ${emailSubject}`);
    } catch (emailErr) {
      console.error(`[Agent] EMAIL ERROR:`, emailErr.message);
    }
  } else {
    console.log(`[Agent] No email needed`);
  }

  console.log(`[Agent] DONE`);
  return {
    timestamp,
    sourcesChecked: scrapedSources.length,
    sourcesSucceeded: scrapedSources.filter((s) => !s.error).length,
    analysis,
    emailSent,
    emailSubject,
  };
}
module.exports = { runAgent, SOURCES };
