/**
 * HTML Report Template for Next.js Insights
 *
 * Minimal, semantic HTML report with:
 * - Collapsible <details> elements for each insight
 * - Copy button for pasting into AI agents
 * - SSE subscription for real-time updates
 * - Fixed-width layout to prevent shift on expand
 */

import type { ReportData } from './insights-report'
import type { Insight } from './insights-types'

/**
 * Generate the complete HTML report
 * @param data - Report data
 * @param ssePort - Port for SSE connection (optional, enables live updates)
 */
export function generateHtmlReport(data: ReportData, ssePort?: number): string {
  const sseScript = ssePort
    ? `
    // SSE for real-time updates
    const evtSource = new EventSource('http://localhost:${ssePort}/events');
    evtSource.onmessage = (event) => {
      const data = JSON.parse(event.data);
      if (data.type === 'connected') {
        console.log('[insights] Connected to server');
        return;
      }
      // New insight received - reload page to show it
      // (Simple approach - could be optimized to inject HTML directly)
      location.reload();
    };
    evtSource.onerror = () => {
      console.log('[insights] SSE connection lost, will retry...');
    };
    `
    : ''

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Next.js Insights Report</title>
  <style>
    body { max-width: 80ch; margin: 2rem auto; padding: 0 1rem; font-family: system-ui, sans-serif; line-height: 1.5; }
    pre { background: #f5f5f5; padding: 1rem; overflow-x: auto; border: 1px solid #ddd; white-space: pre-wrap; word-wrap: break-word; margin: 0; }
    code { background: #f5f5f5; padding: 0.1em 0.3em; }
    details { margin: 1rem 0; border: 1px solid #ccc; }
    summary { padding: 0.75rem; cursor: pointer; background: #fafafa; list-style: none; }
    summary::-webkit-details-marker { display: none; }
    summary::before { content: '▶ '; font-size: 0.75em; }
    details[open] > summary::before { content: '▼ '; }
    summary:hover { background: #f0f0f0; }
    .insight-content { padding: 0; border-top: 1px solid #ccc; position: relative; }
    .copy-btn { position: absolute; top: 0.5rem; right: 0.5rem; font-size: 0.75rem; cursor: pointer; padding: 0.25rem 0.5rem; background: #fff; border: 1px solid #ccc; border-radius: 3px; }
    .copy-btn:hover { background: #f0f0f0; }
    .severity { font-weight: bold; }
    .severity-critical { color: #c00; }
    .severity-high { color: #c60; }
    .severity-medium { color: #a80; }
    .severity-low { color: #080; }
    .debug-section { margin: 0; font-size: 0.875rem; border-top: 1px solid #ccc; }
    .debug-section summary { background: #f0f0f0; padding: 0.5rem 1rem; }
    .debug-section pre { border: none; border-top: 1px solid #ddd; }
    hr { margin: 2rem 0; }
    .live-badge { background: #0a0; color: #fff; font-size: 0.75rem; padding: 0.2em 0.5em; border-radius: 3px; margin-left: 0.5rem; }
    @media (prefers-color-scheme: dark) {
      body { background: #111; color: #eee; }
      pre, code { background: #222; border-color: #444; }
      details { border-color: #444; }
      summary { background: #1a1a1a; }
      summary:hover { background: #222; }
      .insight-content { border-color: #444; }
      .copy-btn { background: #222; border-color: #444; color: #eee; }
      .copy-btn:hover { background: #333; }
      .debug-section { border-color: #444; }
      .debug-section summary { background: #222; }
      .debug-section pre { border-color: #444; }
    }
  </style>
</head>
<body>
  <header>
    <h1>Next.js Insights Report${ssePort ? '<span class="live-badge">LIVE</span>' : ''}</h1>
    <p><time datetime="${data.generatedAt}">${new Date(data.generatedAt).toLocaleString()}</time> · Next.js ${data.nextVersion}</p>
  </header>

  <section>
    <h2>Summary</h2>
    <ul>
      <li><strong>${data.summary.total}</strong> insight(s) detected</li>
      <li><strong>${data.summary.bySeverity.critical}</strong> critical, <strong>${data.summary.bySeverity.high}</strong> high, <strong>${data.summary.bySeverity.medium}</strong> medium, <strong>${data.summary.bySeverity.low}</strong> low</li>
      <li><strong>${Object.keys(data.summary.byRoute).length}</strong> route(s) affected</li>
    </ul>
  </section>

  <hr>

  <main>
    <h2>Insights</h2>
    ${data.insights.length === 0 ? '<p><em>No insights detected yet. Browse your app to trigger waterfall detection.</em></p>' : data.insights.map(renderInsight).join('\n')}
  </main>

  <hr>

  <footer>
    <p><small>Learn more at <a href="https://nextjs.org/docs">nextjs.org/docs</a></small></p>
  </footer>

  <script>
    function copyInsight(btn, event) {
      event.stopPropagation();
      const pre = btn.closest('.insight-content').querySelector('pre');
      navigator.clipboard.writeText(pre.textContent).then(() => {
        btn.textContent = 'Copied!';
        setTimeout(() => btn.textContent = 'Copy', 1500);
      });
    }
    ${sseScript}
  </script>
</body>
</html>`
}

/**
 * Render a single insight
 */
function renderInsight(insight: Insight): string {
  const severityClass = `severity-${insight.severity}`

  const debugSection = insight.debug
    ? `
        <details class="debug-section">
          <summary>Debug Info</summary>
          <pre>${escapeHtml(insight.debug)}</pre>
        </details>`
    : ''

  return `
    <details>
      <summary>
        <span class="severity ${severityClass}">[${insight.severity.toUpperCase()}]</span>
        ${escapeHtml(insight.route)} — ${insight.type}
      </summary>
      <div class="insight-content">
        <button class="copy-btn" onclick="copyInsight(this, event)">Copy</button>
        <pre>${escapeHtml(insight.body)}</pre>
        ${debugSection}
      </div>
    </details>`
}

/**
 * Escape HTML special characters
 */
function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}
