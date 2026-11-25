import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { execFileSync } from 'node:child_process'

const repository = path.join(__dirname, '../..')

function collect(events: unknown[]) {
  const root = fs.mkdtempSync(
    path.join(os.tmpdir(), 'request-insights-effort-')
  )
  try {
    fs.writeFileSync(
      path.join(root, 'result.json'),
      JSON.stringify({ status: 'failed' })
    )
    fs.writeFileSync(path.join(root, 'transcript-raw.jsonl'), '')
    fs.writeFileSync(
      path.join(root, 'transcript.json'),
      JSON.stringify({ events })
    )

    execFileSync(
      process.execPath,
      [
        '--import=tsx',
        'evals/metrics/report.mjs',
        'collect',
        root,
        'request-insights-effort',
      ],
      { cwd: repository }
    )

    return JSON.parse(fs.readFileSync(path.join(root, 'metrics.json'), 'utf8'))
      .collector
  } finally {
    fs.rmSync(root, { recursive: true, force: true })
  }
}

const toolCall = (name: string, args: Record<string, string>) => ({
  type: 'tool_call',
  tool: { name, args },
})

it('records guided diagnosis before project inspection', () => {
  expect(
    collect([
      toolCall('shell', { command: 'ls -la' }),
      toolCall('file_read', {
        file_path: '/workspace/node_modules/next/dist/agent-faq.md',
      }),
      toolCall('file_read', {
        file_path:
          '/workspace/.claude/skills/next-performance/references/request-latency.md',
      }),
      toolCall('file_read', {
        file_path:
          '/workspace/node_modules/next/dist/docs/01-app/02-guides/request-insights.md',
      }),
      toolCall('shell', { command: 'ps aux; cat package.json' }),
      toolCall('shell', {
        command: 'npx next experimental-request-insights list --json',
      }),
      toolCall('file_read', { file_path: '/workspace/next.config.ts' }),
    ])
  ).toEqual({
    requestInsightsBeforeProjectInspection: true,
    bundledDocsSearches: [],
    bundledDocsReads: [
      '/workspace/node_modules/next/dist/docs/01-app/02-guides/request-insights.md',
    ],
  })
})

it('records symptom searches that precede late CLI discovery', () => {
  const search = "rg -n 'slow|performance|latency' node_modules/next/dist/docs/"
  const read =
    'cat node_modules/next/dist/docs/01-app/02-guides/request-insights.md'
  expect(
    collect([
      toolCall('file_read', { file_path: '/workspace/next.config.ts' }),
      toolCall('shell', { command: search }),
      toolCall('shell', { command: read }),
      toolCall('shell', {
        command: 'next experimental-request-insights --help',
      }),
    ])
  ).toEqual({
    requestInsightsBeforeProjectInspection: false,
    bundledDocsSearches: [search],
    bundledDocsReads: [read],
  })
})

it('ignores dev logs and dependencies read before diagnosis', () => {
  expect(
    collect([
      toolCall('file_read', { file_path: '/tmp/agent-063-next-dev.log' }),
      toolCall('file_read', {
        file_path: '/workspace/node_modules/next/dist/server/next-server.js',
      }),
      toolCall('shell', {
        command: 'npx next experimental-request-insights list --json',
      }),
    ])
  ).toMatchObject({ requestInsightsBeforeProjectInspection: true })
})

it('treats Grep and Glob tool calls like shell searches', () => {
  const docsSearch = {
    pattern: 'slow',
    path: '/workspace/node_modules/next/dist/docs',
  }
  expect(
    collect([
      toolCall('grep', docsSearch),
      toolCall('glob', { pattern: 'app/**/*.tsx' }),
      toolCall('shell', {
        command: 'npx next experimental-request-insights list --json',
      }),
    ])
  ).toEqual({
    requestInsightsBeforeProjectInspection: false,
    bundledDocsSearches: [JSON.stringify(docsSearch)],
    bundledDocsReads: [],
  })
})
