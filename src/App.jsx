import React, { useState, useEffect, useCallback } from "react";
import "./App.css";

const API = process.env.NODE_ENV === "production" ? "" : "http://localhost:3001";

function StatusBadge({ detected }) {
  return (
    <span className={`badge ${detected ? "badge-alert" : "badge-ok"}`}>
      {detected ? "⚠ Change Detected" : "✓ No Change"}
    </span>
  );
}

function ConfidencePill({ confidence }) {
  const cls = { high: "conf-high", medium: "conf-medium", low: "conf-low" }[confidence] || "conf-low";
  return <span className={`conf-pill ${cls}`}>{confidence}</span>;
}

function SourceCard({ source }) {
  return (
    <a href={source.url} target="_blank" rel="noreferrer" className="source-card">
      <span className="source-dot" />
      <div>
        <div className="source-name">{source.name}</div>
        <div className="source-url">{source.url}</div>
      </div>
      <span className="source-arrow">↗</span>
    </a>
  );
}

function LogEntry({ log }) {
  const [open, setOpen] = useState(false);
  const a = log.analysis;

  if (log.error) {
    return (
      <div className="log-entry log-error">
        <div className="log-header">
          <span className="log-time">{new Date(log.timestamp).toLocaleString("en-GB")}</span>
          <span className="badge badge-error">Error</span>
        </div>
        <p className="log-err-msg">{log.error}</p>
      </div>
    );
  }

  return (
    <div className="log-entry" onClick={() => setOpen(!open)}>
      <div className="log-header">
        <span className="log-time">{new Date(log.timestamp).toLocaleString("en-GB")}</span>
        {a && <StatusBadge detected={a.changeDetected} />}
        {a?.confidence && <ConfidencePill confidence={a.confidence} />}
        {log.emailSent && <span className="badge badge-email">✉ Email sent</span>}
        <span className="log-chevron">{open ? "▲" : "▼"}</span>
      </div>
      {open && a && (
        <div className="log-body">
          <p className="log-summary">{a.summary}</p>
          {a.currentStatus && (
            <div className="log-status-box">
              <strong>Current status:</strong> {a.currentStatus}
            </div>
          )}
          {a.relevantExcerpts?.length > 0 && (
            <div>
              <p className="log-label">Excerpts</p>
              {a.relevantExcerpts.map((e, i) => (
                <blockquote key={i} className="log-quote">{e}</blockquote>
              ))}
            </div>
          )}
          {a.relevantUrls?.length > 0 && (
            <div>
              <p className="log-label">Relevant URLs</p>
              <ul className="log-urls">
                {a.relevantUrls.map((u, i) => (
                  <li key={i}><a href={u} target="_blank" rel="noreferrer">{u}</a></li>
                ))}
              </ul>
            </div>
          )}
          {a.recommendation && (
            <div className="log-rec">💡 {a.recommendation}</div>
          )}
        </div>
      )}
    </div>
  );
}

export default function App() {
  const [status, setStatus] = useState(null);
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [tab, setTab] = useState("dashboard");
  const [toast, setToast] = useState(null);

  const showToast = (msg, type = "info") => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 4000);
  };

  const fetchData = useCallback(async () => {
    try {
      const [s, l] = await Promise.all([
        fetch(`${API}/api/status`).then(r => r.json()),
        fetch(`${API}/api/logs`).then(r => r.json()),
      ]);
      setStatus(s);
      setLogs(l.logs || []);
    } catch (err) {
      showToast("Could not reach API", "error");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
    const iv = setInterval(fetchData, 30000);
    return () => clearInterval(iv);
  }, [fetchData]);

  const triggerRun = async (forceEmail = false) => {
    if (running) return;
    setRunning(true);
    const endpoint = forceEmail ? "/api/run-with-email" : "/api/run";
    try {
      await fetch(`${API}${endpoint}`, { method: "POST" });
      showToast(
        forceEmail ? "Agent triggered — email will be sent" : "Agent triggered — check logs in ~15s",
        "success"
      );
      setTimeout(fetchData, 8000);
      setTimeout(fetchData, 20000);
    } catch {
      showToast("Failed to trigger agent", "error");
    } finally {
      setTimeout(() => setRunning(false), 3000);
    }
  };

  const lastAnalysis = logs.find(l => l.analysis)?.analysis;

  return (
    <div className="app">
      {toast && <div className={`toast toast-${toast.type}`}>{toast.msg}</div>}

      <header className="header">
        <div className="header-inner">
          <div className="logo">
            <span className="flag">🇳🇱</span>
            <div>
              <h1>Naturalisation Monitor</h1>
              <p>Language Level Policy Tracker · A2 → B1 Watch</p>
            </div>
          </div>
          <div className="header-actions">
            <button className="btn btn-ghost" onClick={() => triggerRun(false)} disabled={running}>
              {running ? "⟳ Running…" : "▶ Run Now"}
            </button>
            <button className="btn btn-primary" onClick={() => triggerRun(true)} disabled={running}>
              ✉ Test Email
            </button>
          </div>
        </div>
        <nav className="nav">
          {["dashboard", "logs", "sources"].map(t => (
            <button key={t} className={`nav-tab ${tab === t ? "active" : ""}`} onClick={() => setTab(t)}>
              {t.charAt(0).toUpperCase() + t.slice(1)}
            </button>
          ))}
        </nav>
      </header>

      <main className="main">
        {loading ? (
          <div className="loading">
            <div className="spinner" />
            <p>Connecting to agent…</p>
          </div>
        ) : (
          <>
            {tab === "dashboard" && (
              <div className="dashboard">
                <div className="cards">
                  <div className="card">
                    <p className="card-label">Current Status</p>
                    {lastAnalysis
                      ? <StatusBadge detected={lastAnalysis.changeDetected} />
                      : <span className="card-value dim">No runs yet</span>}
                  </div>
                  <div className="card">
                    <p className="card-label">Total Runs</p>
                    <span className="card-value">{status?.totalRuns ?? 0}</span>
                  </div>
                  <div className="card">
                    <p className="card-label">Schedule</p>
                    <span className="card-value mono">{status?.schedule || "—"}</span>
                  </div>
                  <div className="card">
                    <p className="card-label">Sources Monitored</p>
                    <span className="card-value">{status?.sources?.length ?? 0}</span>
                  </div>
                </div>

                {lastAnalysis ? (
                  <div className="analysis-panel">
                    <div className="analysis-header">
                      <h2>Latest Analysis</h2>
                      {lastAnalysis.confidence && <ConfidencePill confidence={lastAnalysis.confidence} />}
                    </div>
                    <div className={`analysis-banner ${lastAnalysis.changeDetected ? "alert" : "ok"}`}>
                      <p className="banner-title">
                        {lastAnalysis.changeDetected ? "⚠️ Policy Change Detected" : "✅ No Change Detected"}
                      </p>
                      <p className="banner-summary">{lastAnalysis.summary}</p>
                    </div>
                    {lastAnalysis.currentStatus && (
                      <div className="analysis-section">
                        <h3>Current Language Requirement</h3>
                        <p>{lastAnalysis.currentStatus}</p>
                      </div>
                    )}
                    {lastAnalysis.relevantUrls?.length > 0 && (
                      <div className="analysis-section">
                        <h3>Relevant Links</h3>
                        <ul className="link-list">
                          {lastAnalysis.relevantUrls.map((u, i) => (
                            <li key={i}><a href={u} target="_blank" rel="noreferrer">↗ {u}</a></li>
                          ))}
                        </ul>
                      </div>
                    )}
                    {lastAnalysis.recommendation && (
                      <div className="rec-box">
                        <strong>💡 Recommendation</strong>
                        <p>{lastAnalysis.recommendation}</p>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="empty-state">
                    <div className="empty-icon">🔍</div>
                    <h3>No runs yet</h3>
                    <p>Click <strong>Run Now</strong> to start the first analysis.</p>
                  </div>
                )}
              </div>
            )}

            {tab === "logs" && (
              <div className="logs-panel">
                <div className="logs-header">
                  <h2>Run History</h2>
                  <span className="logs-count">{logs.length} runs</span>
                </div>
                {logs.length === 0 ? (
                  <div className="empty-state">
                    <div className="empty-icon">📋</div>
                    <p>No logs yet. Trigger a run to see results here.</p>
                  </div>
                ) : (
                  <div className="logs-list">
                    {logs.map(log => <LogEntry key={log.id || log.timestamp} log={log} />)}
                  </div>
                )}
              </div>
            )}

            {tab === "sources" && (
              <div className="sources-panel">
                <div className="sources-header">
                  <h2>Monitored Sources</h2>
                  <span className="logs-count">{status?.sources?.length || 0} sources</span>
                </div>
                <p className="sources-desc">
                  Claude checks these official Dutch government sources on every run for any language requirement changes.
                </p>
                <div className="sources-list">
                  {(status?.sources || []).map((s, i) => <SourceCard key={i} source={s} />)}
                </div>
              </div>
            )}
          </>
        )}
      </main>

      <footer className="footer">
        <p>Powered by Claude AI · Auto-refreshes every 30s · Netherlands naturalisation tracker</p>
      </footer>
    </div>
  );
}
