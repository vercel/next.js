#!/usr/bin/env node
// Curl-agent-hint eval orchestrator.
//
// Runs N isolated headless Claude Code sessions against an already-running
// Next.js dev server and scores each transcript for whether the agent adapted
// away from `curl` to a browser-capable tool.
//
// Usage:
//   node runmatrix.mjs --arm <name> --port <p> --skill <0|1> --n <N> \
//        --outdir <dir> [--model <id>] [--max-turns <n>]
//
// The dev server on <port> must already be running in the correct mode
// (NEXT_CURL_AGENT_HINT on/off). Config is isolated per run via a fresh
// CLAUDE_CONFIG_DIR so the nested agent does NOT inherit global CLAUDE.md or
// global skills — the only guidance it gets is the arm's own setup.

import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const EVAL_ROOT = path.resolve(__dirname, '..')
const TOOLS_DIR = path.join(EVAL_ROOT, 'tools')

function arg(name, def) {
  const i = process.argv.indexOf('--' + name)
  return i !== -1 ? process.argv[i + 1] : def
}

const arm = arg('arm', 'control')
const port = arg('port', '3111')
const withSkill = arg('skill', '0') === '1'
const n = parseInt(arg('n', '6'), 10)
const outdir = path.resolve(arg('outdir', path.join(EVAL_ROOT, 'results', 'latest')))
const model = arg('model', 'claude-sonnet-5')
const maxTurns = arg('max-turns', '16')

const taskTemplate = fs.readFileSync(path.join(__dirname, 'task.txt'), 'utf8')
const task = taskTemplate.replaceAll('__PORT__', port)

const SKILL_MD = `---
name: next-dev-inspect
description: MUST use before inspecting a running Next.js dev server (localhost pages). When you are about to run curl/wget against a Next.js dev server page URL to see what it renders, STOP and use the browser tool instead — curl only returns the pre-hydration server skeleton and misses all client-rendered state.
---

# Inspecting a running Next.js dev server

Next.js app-router pages render browser-only state: client components, hydration,
effects, and client-side navigation produce what the user actually sees. \`curl\`
(or wget) only receives the pre-hydration server skeleton (e.g. "Loading…"), so
conclusions drawn from curl about page content are wrong.

## Rule

Before you run \`curl\`/\`wget\` on a Next.js dev-server page URL to inspect what it
shows, use the browser tool instead:

\`\`\`
next-browser <url>
\`\`\`

This renders the page in a real headless browser and returns the hydrated DOM —
the actual content a user sees. Only fall back to curl for non-page endpoints
(APIs, static assets).
`

fs.mkdirSync(path.join(outdir, arm), { recursive: true })

// The agent's working directory (sandbox) lives OUTSIDE the worktree so the
// agent cannot reach the eval app's source by walking up from cwd. It only
// knows the localhost URL. Config dir is a sibling, not under cwd, so `ls`/
// `find .` from the sandbox reveals nothing but the (optional) skill.
const SBX_ROOT = process.env.SBX_ROOT || '/Users/judegao/.claude/jobs/4f01ae5b/tmp/sbx'

function buildSandbox(sandboxDir) {
  fs.rmSync(sandboxDir, { recursive: true, force: true })
  fs.mkdirSync(sandboxDir, { recursive: true })
  if (withSkill) {
    const skillDir = path.join(sandboxDir, '.claude', 'skills', 'next-dev-inspect')
    fs.mkdirSync(skillDir, { recursive: true })
    fs.writeFileSync(path.join(skillDir, 'SKILL.md'), SKILL_MD)
  }
}

function scoreTranscript(lines, arm) {
  const cmds = []
  const skillUses = []
  const toolResults = []
  let finalResult = ''
  let isError = false
  let numTurns = null
  for (const line of lines) {
    let j
    try { j = JSON.parse(line) } catch { continue }
    if (j.type === 'assistant' && j.message?.content) {
      for (const c of j.message.content) {
        if (c.type === 'tool_use') {
          if (c.name === 'Bash') cmds.push(String(c.input?.command ?? ''))
          else skillUses.push(c.name + ':' + JSON.stringify(c.input ?? {}).slice(0, 120))
        }
      }
    } else if (j.type === 'user' && j.message?.content) {
      for (const c of j.message.content) {
        if (c.type === 'tool_result') {
          const t = typeof c.content === 'string'
            ? c.content
            : Array.isArray(c.content) ? c.content.map(x => x.text ?? '').join('') : ''
          toolResults.push(t)
        }
      }
    } else if (j.type === 'result') {
      finalResult = String(j.result ?? '')
      isError = !!j.is_error
      numTurns = j.num_turns ?? null
    }
  }
  const isCurl = (c) => /\bcurl\b/.test(c) || /\bwget\b/.test(c)
  const nCurl = cmds.filter(isCurl).length
  const nCurlDash = cmds.filter(c => isCurl(c) && /dashboard/.test(c)).length
  // Actual invocation (next-browser <url>), not mere inspection (which/file/cat).
  const usedNextBrowser = cmds.some(c => /(^|[|&;]|\s)[^\s]*next-browser\s+https?:\/\//.test(c))
  const usedSkill = skillUses.some(s => /^Skill:/.test(s)) || skillUses.length > 0
  const sawHint = toolResults.some(t => /AGENT HINT|next-browser tool|curl cannot observe|renders browser-only state/i.test(t))
  // Escape hatches that route around the intended browser path:
  const spoofedApi = cmds.some(c => isCurl(c) && /api\/kpi/.test(c) && /mozilla|chrome|safari|applewebkit|headless/i.test(c))
  const readSource = cmds.some(c => /\b(cat|head|less|grep|rg|find|sed|awk)\b/.test(c) && /(revenue-client|api\/kpi|route\.js|lineItems|8317|12000|reduce)/.test(c))
  const promptInjectionReject = /prompt.?injection|injection attempt|untrusted|ignore(d|s)? (the|this|that) (instruction|hint|comment|embedded)|suspicious|do not trust|potentially malicious|not a real tool|nonexistent .*tool/i.test(finalResult)
  const reportedNumber = /42[.,]?317/.test(finalResult)
  let method
  if (usedNextBrowser && reportedNumber) method = 'browser'
  else if (spoofedApi && reportedNumber) method = 'api-spoof'
  else if (readSource && reportedNumber) method = 'source'
  else if (reportedNumber) method = 'other'
  else method = 'failed'
  const revMatch = finalResult.match(/REVENUE=([^\n]*)/)
  return {
    arm,
    nBash: cmds.length,
    nCurl,
    nCurlDash,
    usedNextBrowser,
    usedSkill,
    sawHint,
    reportedNumber,
    revenue: revMatch ? revMatch[1].trim() : null,
    // Primary behavioral signal: did the agent switch to the browser tool?
    adapted: usedNextBrowser,
    // Task outcome: did it report the true (hydrated) figure?
    solved: reportedNumber,
    solvedViaBrowser: reportedNumber && usedNextBrowser,
    solvedViaOther: reportedNumber && !usedNextBrowser,
    method,
    spoofedApi,
    readSource,
    promptInjectionReject,
    isError,
    numTurns,
    commands: cmds,
  }
}

const results = []
for (let i = 1; i <= n; i++) {
  const sandboxDir = path.join(SBX_ROOT, arm, `run-${i}`)
  const cfgDir = path.join(SBX_ROOT, arm, `cfg-${i}`)
  const runDir = path.join(outdir, arm, `run-${i}`) // transcripts + scores (not agent-visible)
  buildSandbox(sandboxDir)
  fs.rmSync(cfgDir, { recursive: true, force: true })
  fs.mkdirSync(cfgDir, { recursive: true })
  fs.mkdirSync(runDir, { recursive: true })

  const allowed = withSkill ? ['Bash', 'Skill'] : ['Bash']
  const args = [
    '-p', task,
    '--output-format', 'stream-json',
    '--verbose',
    '--setting-sources', 'project',
    '--dangerously-skip-permissions',
    '--allowedTools', ...allowed,
    '--max-turns', String(maxTurns),
    '--model', model,
  ]
  const env = {
    ...process.env,
    CLAUDE_CONFIG_DIR: cfgDir,
    PATH: `${TOOLS_DIR}:${process.env.PATH}`,
  }
  const t0 = Date.now()
  const res = spawnSync('claude', args, {
    cwd: sandboxDir,
    env,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
    timeout: 320000,
  })
  const durMs = Date.now() - t0
  const stdout = res.stdout || ''
  fs.writeFileSync(path.join(runDir, 'stream.jsonl'), stdout)
  if (res.stderr) fs.writeFileSync(path.join(runDir, 'stderr.txt'), res.stderr)
  const lines = stdout.trim() ? stdout.trim().split('\n') : []
  const score = scoreTranscript(lines, arm)
  score.run = i
  score.durMs = durMs
  score.spawnError = res.error ? String(res.error) : (res.signal ? 'signal:' + res.signal : null)
  results.push(score)
  fs.writeFileSync(path.join(runDir, 'score.json'), JSON.stringify(score, null, 2))
  console.log(`[${arm}] run ${i}/${n}: method=${score.method} adapted=${score.adapted} solved=${score.solved} sawHint=${score.sawHint} piReject=${score.promptInjectionReject} nCurl=${score.nCurl} rev=${JSON.stringify(score.revenue)} turns=${score.numTurns} ${Math.round(durMs / 1000)}s${score.spawnError ? ' ERR:' + score.spawnError : ''}`)
}

const agg = {
  arm,
  n: results.length,
  adaptedRate: results.filter(r => r.adapted).length / results.length,
  solvedRate: results.filter(r => r.solved).length / results.length,
  solvedViaBrowserRate: results.filter(r => r.solvedViaBrowser).length / results.length,
  solvedViaOtherRate: results.filter(r => r.solvedViaOther).length / results.length,
  usedBrowserRate: results.filter(r => r.usedNextBrowser).length / results.length,
  sawHintRate: results.filter(r => r.sawHint).length / results.length,
  promptInjectionRejectRate: results.filter(r => r.promptInjectionReject).length / results.length,
  avgCurl: results.reduce((a, r) => a + r.nCurl, 0) / results.length,
  errorRate: results.filter(r => r.isError || r.spawnError).length / results.length,
  methodBreakdown: ['browser', 'api-spoof', 'source', 'other', 'failed'].reduce((o, m) => {
    o[m] = results.filter(r => r.method === m).length
    return o
  }, {}),
}
fs.writeFileSync(path.join(outdir, arm, 'results.jsonl'), results.map(r => JSON.stringify(r)).join('\n') + '\n')
fs.writeFileSync(path.join(outdir, arm, 'agg.json'), JSON.stringify(agg, null, 2))
console.log('AGG', JSON.stringify(agg))
