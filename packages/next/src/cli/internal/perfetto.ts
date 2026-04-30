import http from 'node:http'
import { promises as fsPromises } from 'node:fs'
import path from 'node:path'
import type { AddressInfo } from 'node:net'

import {
  convertNextTraceToChromeEventFormat,
  listTraceSessions,
  type ChromeTraceObject,
} from '../../trace/to-chrome-event-format'

const PERFETTO_ORIGIN = 'https://ui.perfetto.dev'
// Default trace file locations, in priority order. `next build` writes to
// `.next/trace`, while `next dev` writes to `.next/dev/trace` (its distDir is
// `.next/dev`).
const DEFAULT_TRACE_FILES = ['.next/trace', '.next/dev/trace']
// Default port for the launcher server. Picked to be memorable and unlikely
// to collide with the dev server (3000) or other common Next.js ports.
const DEFAULT_PORT = 3210
// When the default port is taken, walk up to this many ports trying to find
// a free one before giving up. Mirrors the behavior of `next dev`.
const MAX_PORT_RETRIES = 10

interface ConvertedTraceCache {
  mtimeMs: number
  size: number
  lastModified: string
  buffer: Buffer
}

interface PerfettoServerOptions {
  port?: number
}

/**
 * Walk up from the trace file's directory looking for the nearest
 * `package.json` with a `name` field, and return that name. This is best-
 * effort: any read or parse failure is treated as "not found" and we return
 * `null`.
 */
async function findPackageName(traceFilePath: string): Promise<string | null> {
  let dir = path.dirname(path.resolve(traceFilePath))
  // Stop at the filesystem root.
  while (true) {
    const pkgPath = path.join(dir, 'package.json')
    try {
      const contents = await fsPromises.readFile(pkgPath, 'utf8')
      const parsed = JSON.parse(contents) as { name?: unknown }
      if (typeof parsed.name === 'string' && parsed.name.length > 0) {
        return parsed.name
      }
    } catch {
      // Missing, unreadable, or invalid JSON — keep walking up.
    }
    const parent = path.dirname(dir)
    if (parent === dir) return null
    dir = parent
  }
}

/**
 * Build a tiny self-contained HTML page that lists the sessions found in the
 * trace file (one button per session) and, on click, opens ui.perfetto.dev
 * in a new tab and pipes the converted trace JSON across via the documented
 * PING/PONG postMessage handshake. The click is required so `window.open`
 * runs inside a user gesture and isn't blocked.
 *
 * See: https://perfetto.dev/docs/visualization/deep-linking-to-perfetto-ui
 */
function renderLauncherHtml(
  traceFilePath: string,
  packageName: string | null
): string {
  const fileBasename = path.basename(traceFilePath)
  const escape = (value: string) =>
    value
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>Open Next.js trace in Perfetto</title>
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <style>
    :root {
      color-scheme: light dark;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      --fg: #111;
      --fg-muted: #6b7280;
      --fg-faint: #9ca3af;
      --bg: #fff;
      --surface: #fafafa;
      --border: #e5e7eb;
      --accent: #111;
      --accent-fg: #fff;
      --error: #b91c1c;
    }
    @media (prefers-color-scheme: dark) {
      :root {
        --fg: #f5f5f5;
        --fg-muted: #9ca3af;
        --fg-faint: #6b7280;
        --bg: #1a1a1a;
        --surface: #222;
        --border: #2e2e2e;
        --accent: #f5f5f5;
        --accent-fg: #111;
        --error: #f87171;
      }
    }
    body { margin: 0; padding: 2.5rem 1.5rem 4rem; max-width: 720px; margin-inline: auto; color: var(--fg); background: var(--bg); }
    h1 { font-size: 1.25rem; margin: 0 0 0.75rem; font-weight: 600; }
    code, .mono { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; }
    .header { margin-bottom: 1.75rem; color: var(--fg-muted); font-size: 0.9rem; line-height: 1.5; }
    .header p { margin: 0.15rem 0; }
    .header code { color: var(--fg); word-break: break-all; }
    .ghost {
      font: inherit;
      cursor: pointer;
      background: transparent;
      color: var(--fg-muted);
      border: 1px solid var(--border);
      border-radius: 6px;
      padding: 0.3rem 0.7rem;
      font-size: 0.85rem;
    }
    .ghost:hover { color: var(--fg); border-color: var(--fg-muted); }
    .ghost[disabled] { opacity: 0.5; cursor: not-allowed; }
    .section-label {
      font-size: 0.75rem;
      font-weight: 600;
      letter-spacing: 0.05em;
      text-transform: uppercase;
      color: var(--fg-faint);
      margin: 1.5rem 0 0.5rem;
    }
    .section-label:first-child { margin-top: 0; }
    .session-list {
      list-style: none;
      padding: 0;
      margin: 0;
      display: grid;
      gap: 1px;
      background: var(--border);
      border: 1px solid var(--border);
      border-radius: 8px;
      overflow: hidden;
    }
    .session-list li { display: contents; }
    .session {
      /* Reset button defaults so the row reads as a normal card. */
      appearance: none;
      font: inherit;
      text-align: left;
      cursor: pointer;
      width: 100%;
      border: 0;
      color: var(--fg);
      background: var(--surface);
      padding: 0.9rem 1rem;
      display: grid;
      grid-template-columns: minmax(0, 1fr) auto 1rem;
      align-items: center;
      gap: 1.25rem;
      transition: background-color 80ms ease;
    }
    .session:hover { background: var(--bg); }
    .session:focus-visible {
      outline: 2px solid var(--accent);
      outline-offset: -2px;
    }
    .session[disabled] { cursor: progress; opacity: 0.6; }
    .session .primary { min-width: 0; }
    .session .when {
      font-size: 0.95rem;
      font-weight: 500;
      color: var(--fg);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .session .name {
      font-size: 0.8rem;
      color: var(--fg-muted);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      margin-top: 0.15rem;
    }
    .session .stats {
      font-size: 0.8rem;
      color: var(--fg-muted);
      text-align: right;
      white-space: nowrap;
      font-variant-numeric: tabular-nums;
      line-height: 1.4;
    }
    .session .stats .events { color: var(--fg-faint); }
    .session .chevron {
      color: var(--fg-faint);
      font-size: 1.1rem;
      line-height: 1;
      transition: transform 80ms ease, color 80ms ease;
    }
    .session:hover .chevron { color: var(--fg-muted); transform: translateX(2px); }
    #status { margin-top: 1.25rem; min-height: 1.4em; font-size: 0.85rem; color: var(--fg-muted); }
    .error { color: var(--error) !important; }
    .empty { padding: 1.5rem; text-align: center; color: var(--fg-muted); background: var(--surface); border: 1px dashed var(--border); border-radius: 8px; }
    .source-row { display: flex; gap: 0.5rem; align-items: center; flex-wrap: wrap; }
  </style>
</head>
<body>
  <header class="header">
    <h1>Open Next.js trace in Perfetto</h1>
    ${packageName ? `<p>Project: <code>${escape(packageName)}</code></p>` : ''}
    <p class="source-row"><span>Source: <code>${escape(traceFilePath)}</code></span> <button id="refresh" class="ghost" type="button" title="Re-read sessions from disk" aria-label="Refresh sessions list">Refresh</button></p>
  </header>
  <div id="sessions-container" aria-busy="true">
    <ul class="session-list"><li class="empty">Loading sessions…</li></ul>
  </div>
  <div id="status" role="status" aria-live="polite"></div>

  <script>
    const PERFETTO_ORIGIN = ${JSON.stringify(PERFETTO_ORIGIN)};
    const FILE_BASENAME = ${JSON.stringify(fileBasename)};
    const PACKAGE_NAME = ${JSON.stringify(packageName)};
    const $ = (id) => document.getElementById(id);
    const setStatus = (msg, isError) => {
      const el = $('status');
      el.textContent = msg;
      el.className = isError ? 'error' : '';
    };

    function formatDuration(microseconds) {
      const seconds = microseconds / 1_000_000;
      if (seconds < 1) return (microseconds / 1000).toFixed(0) + ' ms';
      if (seconds < 60) return seconds.toFixed(1) + ' s';
      const m = Math.floor(seconds / 60);
      const s = Math.round(seconds - m * 60);
      return m + 'm ' + s + 's';
    }

    function formatEventCount(n) {
      if (n < 1000) return String(n);
      // The doubled backslash in the regex below is required because this
      // entire script body is inside a TS template literal in perfetto.ts;
      // in the rendered HTML it becomes /[backslash].0[dollar]/ which
      // matches a literal '.' followed by '0' at end of string.
      if (n < 10_000) return (n / 1000).toFixed(1).replace(/\\.0$/, '') + 'k';
      return Math.round(n / 1000) + 'k';
    }

    function formatAbsoluteTimestamp(ms) {
      if (typeof ms !== 'number') return null;
      const d = new Date(ms);
      if (Number.isNaN(d.getTime())) return null;
      try {
        return d.toLocaleString(undefined, {
          year: 'numeric',
          month: 'short',
          day: '2-digit',
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
        });
      } catch {
        return d.toISOString();
      }
    }

    function formatRelativeTime(ms) {
      if (typeof ms !== 'number') return null;
      const diffSec = (Date.now() - ms) / 1000;
      const abs = Math.abs(diffSec);
      const sign = diffSec >= 0 ? -1 : 1;
      try {
        const rtf = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' });
        if (abs < 45) return rtf.format(sign * Math.round(abs), 'second');
        if (abs < 60 * 45) return rtf.format(sign * Math.round(abs / 60), 'minute');
        if (abs < 60 * 60 * 22) return rtf.format(sign * Math.round(abs / 3600), 'hour');
        if (abs < 60 * 60 * 24 * 6) return rtf.format(sign * Math.round(abs / 86400), 'day');
        if (abs < 60 * 60 * 24 * 27) return rtf.format(sign * Math.round(abs / (86400 * 7)), 'week');
        if (abs < 60 * 60 * 24 * 320) return rtf.format(sign * Math.round(abs / (86400 * 30)), 'month');
        return rtf.format(sign * Math.round(abs / (86400 * 365)), 'year');
      } catch {
        return null;
      }
    }

    function dayBucket(ms) {
      // Local-time day bucket so "Today"/"Yesterday" align with the user's clock.
      const d = new Date(ms);
      const today = new Date();
      const startOfDay = (x) =>
        new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
      const diffDays = Math.round((startOfDay(today) - startOfDay(d)) / 86_400_000);
      if (diffDays === 0) return { key: 'today', label: 'Today' };
      if (diffDays === 1) return { key: 'yesterday', label: 'Yesterday' };
      if (diffDays < 7) {
        return {
          key: 'd' + d.toDateString(),
          label: d.toLocaleDateString(undefined, { weekday: 'long' }),
        };
      }
      return {
        key: 'd' + d.toDateString(),
        label: d.toLocaleDateString(undefined, {
          month: 'long',
          day: 'numeric',
          year: d.getFullYear() === today.getFullYear() ? undefined : 'numeric',
        }),
      };
    }

    function buildTitle(session) {
      const parts = [];
      if (PACKAGE_NAME) parts.push(PACKAGE_NAME);
      parts.push(session.name || 'Next.js trace');
      // Prefer the session's wall-clock start time so titles are stable
      // across re-sends; fall back to "now" when the trace doesn't carry one.
      const start =
        typeof session.wallClockStartTime === 'number'
          ? new Date(session.wallClockStartTime)
          : new Date();
      parts.push(start.toISOString());
      parts.push(FILE_BASENAME);
      return parts.join(' — ');
    }

    async function openSessionInPerfetto(session) {
      // Open the new tab synchronously inside the click handler so popup
      // blockers don't interfere. Fetch the converted trace in parallel.
      setStatus('Opening ' + PERFETTO_ORIGIN + '…');
      const win = window.open(PERFETTO_ORIGIN);
      if (!win) {
        throw new Error('Popup was blocked. Allow popups for this site and try again.');
      }

      setStatus('Fetching converted trace for "' + session.name + '"…');
      const params = session.traceId ? '?session=' + encodeURIComponent(session.traceId) : '';
      const res = await fetch('/trace.json' + params, { cache: 'no-store' });
      if (!res.ok) throw new Error('Failed to fetch trace: HTTP ' + res.status);
      const buffer = await res.arrayBuffer();

      setStatus('Waiting for Perfetto UI to be ready…');
      const title = buildTitle(session);

      await new Promise((resolve, reject) => {
        const onMessage = (event) => {
          if (event.origin !== PERFETTO_ORIGIN) return;
          if (event.data !== 'PONG') return;
          window.removeEventListener('message', onMessage);
          clearInterval(timer);
          clearTimeout(timeout);
          resolve();
        };
        window.addEventListener('message', onMessage);
        const timer = setInterval(() => {
          try { win.postMessage('PING', PERFETTO_ORIGIN); } catch {}
        }, 50);
        const timeout = setTimeout(() => {
          window.removeEventListener('message', onMessage);
          clearInterval(timer);
          reject(new Error('Timed out waiting for Perfetto UI to respond.'));
        }, 15000);
      });

      setStatus('Sending trace…');
      win.postMessage({ perfetto: { buffer, title } }, PERFETTO_ORIGIN);
      setStatus('Trace "' + session.name + '" sent. The Perfetto tab should now be loading it.');
    }

    function buildSessionRow(session) {
      const li = document.createElement('li');

      // The whole row is the click target. Using <button> keeps Enter/Space
      // activation and screen-reader semantics correct (it's an action, not
      // navigation), and the synchronous window.open() inside the click
      // handler still satisfies popup blockers.
      const row = document.createElement('button');
      row.type = 'button';
      row.className = 'session';
      const ariaParts = ['Open'];
      if (session.name) ariaParts.push(session.name);
      ariaParts.push('in Perfetto');
      row.setAttribute('aria-label', ariaParts.join(' '));

      const primary = document.createElement('div');
      primary.className = 'primary';

      const when = document.createElement('div');
      when.className = 'when';
      const absolute = formatAbsoluteTimestamp(session.wallClockStartTime);
      const relative = formatRelativeTime(session.wallClockStartTime);
      when.textContent = relative || absolute || 'Unknown time';
      // Tuck the absolute timestamp + traceId into a tooltip so the row
      // stays uncluttered but the details remain a hover away.
      const tooltip = [
        absolute,
        session.traceId ? 'traceId: ' + session.traceId : null,
      ]
        .filter(Boolean)
        .join(' \u2014 ');
      if (tooltip) row.title = tooltip;

      const name = document.createElement('div');
      name.className = 'name';
      name.textContent = session.name || '(unnamed)';

      primary.appendChild(when);
      primary.appendChild(name);

      const stats = document.createElement('div');
      stats.className = 'stats';
      const dur = document.createElement('div');
      dur.className = 'duration';
      dur.textContent = formatDuration(session.duration);
      const events = document.createElement('div');
      events.className = 'events';
      events.textContent = formatEventCount(session.eventCount) + ' events';
      stats.appendChild(dur);
      stats.appendChild(events);

      const chevron = document.createElement('span');
      chevron.className = 'chevron';
      chevron.setAttribute('aria-hidden', 'true');
      chevron.textContent = '\u203A'; // ›

      row.appendChild(primary);
      row.appendChild(stats);
      row.appendChild(chevron);

      row.addEventListener('click', async () => {
        row.disabled = true;
        try {
          await openSessionInPerfetto(session);
        } catch (err) {
          setStatus(err && err.message ? err.message : String(err), true);
        } finally {
          row.disabled = false;
        }
      });

      li.appendChild(row);
      return li;
    }

    function renderSessions(sessions) {
      const container = $('sessions-container');
      container.innerHTML = '';
      container.removeAttribute('aria-busy');

      if (!sessions.length) {
        const empty = document.createElement('div');
        empty.className = 'empty';
        empty.textContent = 'No sessions found in this trace file.';
        container.appendChild(empty);
        return;
      }

      // Most-recent first. Prefer the wall-clock start time when present;
      // otherwise fall back to reversing the file order, since sessions are
      // appended over time.
      const sorted = [...sessions];
      const allHaveTimes = sorted.every(
        (s) => typeof s.wallClockStartTime === 'number'
      );
      if (allHaveTimes) {
        sorted.sort((a, b) => b.wallClockStartTime - a.wallClockStartTime);
      } else {
        sorted.reverse();
      }

      // When we have wall-clock data, group rows by day for a calmer scan.
      // Without wall-clock data, render a single ungrouped list.
      if (!allHaveTimes) {
        const ul = document.createElement('ul');
        ul.className = 'session-list';
        for (const session of sorted) ul.appendChild(buildSessionRow(session));
        container.appendChild(ul);
        return;
      }

      let currentBucketKey = null;
      let currentList = null;
      for (const session of sorted) {
        const bucket = dayBucket(session.wallClockStartTime);
        if (bucket.key !== currentBucketKey) {
          const label = document.createElement('div');
          label.className = 'section-label';
          label.textContent = bucket.label;
          container.appendChild(label);
          currentList = document.createElement('ul');
          currentList.className = 'session-list';
          container.appendChild(currentList);
          currentBucketKey = bucket.key;
        }
        currentList.appendChild(buildSessionRow(session));
      }
    }

    async function loadSessions() {
      const container = $('sessions-container');
      container.setAttribute('aria-busy', 'true');
      container.innerHTML = '<div class="empty">Loading sessions…</div>';
      setStatus('');
      try {
        const res = await fetch('/sessions.json', { cache: 'no-store' });
        if (!res.ok) throw new Error('HTTP ' + res.status);
        const sessions = await res.json();
        renderSessions(sessions);
      } catch (err) {
        container.innerHTML = '';
        container.removeAttribute('aria-busy');
        setStatus(
          'Could not load sessions: ' + (err && err.message ? err.message : String(err)),
          true
        );
      }
    }

    $('refresh').addEventListener('click', loadSessions);
    loadSessions();
  </script>
</body>
</html>
`
}

/**
 * Read the source trace file, convert it (optionally filtered to a single
 * `traceId`), and cache the resulting JSON buffer keyed by the source file's
 * `mtimeMs`+`size`+`traceId`. The buffer is what we serve over HTTP, so we
 * keep it in memory rather than re-running the (potentially expensive)
 * conversion on every refresh. The cache is invalidated as soon as the
 * source file's mtime or size changes.
 */
function createTraceLoader(filePath: string) {
  // Map of `traceId ?? ''` → cached buffer. The "all sessions" entry uses ''
  // as its key.
  let cachedMtimeMs = -1
  let cachedSize = -1
  let cachedLastModified = ''
  const buffers = new Map<string, Buffer>()
  const inflight = new Map<string, Promise<ConvertedTraceCache>>()

  async function load(traceId?: string): Promise<ConvertedTraceCache> {
    const stat = await fsPromises.stat(filePath)
    if (stat.mtimeMs !== cachedMtimeMs || stat.size !== cachedSize) {
      // Source file changed: drop everything we have.
      buffers.clear()
      inflight.clear()
      cachedMtimeMs = stat.mtimeMs
      cachedSize = stat.size
      cachedLastModified = new Date(stat.mtimeMs).toUTCString()
    }

    const key = traceId ?? ''
    const existing = buffers.get(key)
    if (existing) {
      return {
        mtimeMs: cachedMtimeMs,
        size: cachedSize,
        lastModified: cachedLastModified,
        buffer: existing,
      }
    }
    const pending = inflight.get(key)
    if (pending) return pending

    const promise = (async (): Promise<ConvertedTraceCache> => {
      try {
        const converted: ChromeTraceObject =
          await convertNextTraceToChromeEventFormat(filePath, { traceId })
        const buffer = Buffer.from(JSON.stringify(converted))
        buffers.set(key, buffer)
        console.log(
          `Converted trace${
            traceId ? ` for session ${traceId}` : ''
          } (${buffer.byteLength} bytes, source mtime ${cachedLastModified})`
        )
        return {
          mtimeMs: cachedMtimeMs,
          size: cachedSize,
          lastModified: cachedLastModified,
          buffer,
        }
      } finally {
        inflight.delete(key)
      }
    })()
    inflight.set(key, promise)
    return promise
  }

  return load
}

/**
 * Build the HTTP server (without binding to a port). Exposed for tests; the
 * CLI entry point below wraps this with file-existence checks, error
 * handling, signal listeners, and `server.listen()`.
 *
 * Routes (all same-origin from the launcher page; no CORS needed):
 *
 *   GET /                  – launcher HTML; lists sessions and lets the user
 *                            click one to open it in Perfetto via postMessage.
 *   GET /sessions.json     – `TraceSessionSummary[]` for the current file.
 *   GET /trace.json        – full converted trace (all sessions).
 *   GET /trace.json?session=<traceId>
 *                          – converted trace filtered to a single session.
 */
export function createPerfettoTraceServer(
  traceFilePath: string,
  packageName: string | null = null
): http.Server {
  const loadTrace = createTraceLoader(traceFilePath)
  const launcherHtml = renderLauncherHtml(traceFilePath, packageName)

  return http.createServer(async (req, res) => {
    const url = new URL(req.url ?? '/', 'http://localhost')

    if (
      req.method === 'GET' &&
      (url.pathname === '/' || url.pathname === '/index.html')
    ) {
      res.writeHead(200, {
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'no-store',
      })
      res.end(launcherHtml)
      return
    }

    if (
      (req.method === 'GET' || req.method === 'HEAD') &&
      url.pathname === '/sessions.json'
    ) {
      try {
        const sessions = await listTraceSessions(traceFilePath)
        const buffer = Buffer.from(JSON.stringify(sessions))
        res.setHeader('Content-Type', 'application/json; charset=utf-8')
        res.setHeader('Content-Length', String(buffer.byteLength))
        res.setHeader('Cache-Control', 'no-store')
        if (req.method === 'HEAD') {
          res.writeHead(200)
          res.end()
        } else {
          res.writeHead(200)
          res.end(buffer)
        }
      } catch (err) {
        const code = (err as NodeJS.ErrnoException).code
        const status = code === 'ENOENT' ? 404 : 500
        const message =
          code === 'ENOENT'
            ? `Trace file no longer exists at "${traceFilePath}".`
            : `Failed to read sessions: ${
                err instanceof Error ? err.message : String(err)
              }`
        console.error(message)
        res.writeHead(status, { 'Content-Type': 'text/plain; charset=utf-8' })
        res.end(message + '\n')
      }
      return
    }

    if (
      (req.method === 'GET' || req.method === 'HEAD') &&
      url.pathname === '/trace.json'
    ) {
      const sessionParam = url.searchParams.get('session') ?? undefined
      try {
        const entry = await loadTrace(sessionParam)
        res.setHeader('Content-Type', 'application/json; charset=utf-8')
        res.setHeader('Content-Length', String(entry.buffer.byteLength))
        res.setHeader('Cache-Control', 'no-store')
        res.setHeader('Last-Modified', entry.lastModified)
        if (req.method === 'HEAD') {
          res.writeHead(200)
          res.end()
        } else {
          res.writeHead(200)
          res.end(entry.buffer)
        }
      } catch (err) {
        const code = (err as NodeJS.ErrnoException).code
        const status = code === 'ENOENT' ? 404 : 500
        const message =
          code === 'ENOENT'
            ? `Trace file no longer exists at "${traceFilePath}".`
            : `Failed to read or convert trace: ${
                err instanceof Error ? err.message : String(err)
              }`
        console.error(message)
        res.writeHead(status, { 'Content-Type': 'text/plain; charset=utf-8' })
        res.end(message + '\n')
      }
      return
    }

    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' })
    res.end('Not found.\n')
  })
}

/**
 * Resolve the trace file path, returning the first existing default location
 * if `file` is undefined. Exits the process with a friendly error if no
 * candidate exists or the resolved path is unreadable / not a regular file.
 */
async function resolveTraceFile(file: string | undefined): Promise<string> {
  if (file !== undefined) {
    const resolved = path.resolve(process.cwd(), file)
    try {
      const stat = await fsPromises.stat(resolved)
      if (!stat.isFile()) {
        console.error(`Error: "${resolved}" is not a file.`)
        process.exit(1)
      }
      return resolved
    } catch (err) {
      const code = (err as NodeJS.ErrnoException).code
      if (code === 'ENOENT') {
        console.error(`Error: Could not find trace file at "${resolved}".`)
      } else {
        console.error(
          `Error: Could not read trace file at "${resolved}": ${
            err instanceof Error ? err.message : err
          }`
        )
      }
      process.exit(1)
    }
  }

  const candidates = DEFAULT_TRACE_FILES.map((p) =>
    path.resolve(process.cwd(), p)
  )
  for (const candidate of candidates) {
    try {
      const stat = await fsPromises.stat(candidate)
      if (stat.isFile()) {
        return candidate
      }
    } catch (err) {
      const code = (err as NodeJS.ErrnoException).code
      if (code !== 'ENOENT') {
        console.error(
          `Error: Could not read trace file at "${candidate}": ${
            err instanceof Error ? err.message : err
          }`
        )
        process.exit(1)
      }
    }
  }

  console.error(
    `Error: Could not find a trace file. Looked for:\n` +
      candidates.map((c) => `  - ${c}`).join('\n') +
      `\nRun \`next build\` or \`next dev\` first to generate \`.next/trace\`, ` +
      `or pass an explicit path: \`next internal perfetto path/to/trace\`.`
  )
  process.exit(1)
}

export async function startPerfettoServerCli(
  file: string | undefined,
  options: PerfettoServerOptions = {}
): Promise<void> {
  const traceFilePath = await resolveTraceFile(file)
  const packageName = await findPackageName(traceFilePath)

  const server = createPerfettoTraceServer(traceFilePath, packageName)

  // When the user didn't explicitly request a port, start at the default and
  // walk up if it's taken. When they did pass --port, we treat that as an
  // intentional choice and fail fast on EADDRINUSE rather than silently
  // landing on a different port.
  const userSpecifiedPort = options.port != null
  const initialPort = options.port ?? DEFAULT_PORT
  let currentPort = initialPort
  let portRetries = 0

  server.on('error', (err: NodeJS.ErrnoException) => {
    if (
      err.code === 'EADDRINUSE' &&
      !userSpecifiedPort &&
      portRetries < MAX_PORT_RETRIES
    ) {
      portRetries += 1
      currentPort += 1
      server.listen(currentPort, '127.0.0.1')
      return
    }
    if (err.code === 'EADDRINUSE') {
      console.error(
        `Error: Port ${currentPort} is already in use. Use --port to specify a different port.`
      )
    } else {
      console.error(`Error starting Perfetto server: ${err.message}`)
    }
    process.exit(1)
  })

  const onShutdown = () => {
    server.close(() => process.exit(0))
  }
  process.once('SIGINT', onShutdown)
  process.once('SIGTERM', onShutdown)

  return new Promise<void>((resolve) => {
    server.on('listening', () => {
      const address = server.address() as AddressInfo
      const launcherUrl = `http://127.0.0.1:${address.port}/`
      console.log(`Serving converted trace from ${traceFilePath}`)
      if (!userSpecifiedPort && address.port !== initialPort) {
        console.log(
          `Port ${initialPort} was in use, using ${address.port} instead.`
        )
      }
      console.log(`Open this URL and click "Open in Perfetto": ${launcherUrl}`)
      console.log(
        'Refreshing the launcher page re-reads the trace from disk. Press Ctrl+C to stop.'
      )
      resolve()
    })
    server.listen(currentPort, '127.0.0.1')
  })
}
