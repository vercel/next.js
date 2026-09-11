import { readFileSync, writeFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'

const root = '/tmp/next-upgrade-tools'
const input = JSON.parse(process.argv[2])
const scenario = JSON.parse(readFileSync(`${root}/scenario.json`, 'utf8'))
const baseline = JSON.parse(readFileSync(`${root}/baseline.json`, 'utf8'))
process.env.PATH = `${root}/bin:${process.env.PATH}`
process.env.NEXT_TELEMETRY_DISABLED = '1'
let result
try {
  const version = spawnSync(baseline.harness, ['--version'], {
    encoding: 'utf8',
    timeout: 30000,
  })
  if (version.error || version.status !== 0)
    throw new Error('SETUP_BLOCKED: selected harness is unavailable')
  writeFileSync(`${root}/harness-version.txt`, version.stdout)

  if (scenario.entry === 'terminal') {
    writeFileSync(
      `${root}/terminal-input.json`,
      JSON.stringify({ ...input, harness: baseline.harness })
    )
    const terminal = spawnSync(
      'python3',
      [`${root}/terminal.py`, `${root}/terminal-input.json`],
      {
        cwd: input.cwd,
        env: process.env,
        encoding: 'utf8',
        timeout: 1150000,
        maxBuffer: 10 * 1024 * 1024,
      }
    )
    if (terminal.error || terminal.status !== 0)
      throw new Error(
        `SETUP_BLOCKED: terminal driver failed: ${terminal.stderr || terminal.error}`
      )
    result = JSON.parse(readFileSync(`${root}/terminal-result.json`, 'utf8'))
  } else {
    const { runAgent } = await import(`${root}/native-runner.mjs`)
    result = await runAgent(input)
  }
} catch (error) {
  result = {
    ok: false,
    output: '',
    transcript: null,
    observedModel: null,
    error: String(error),
  }
}
// Preserve actual transcripts for withheld assertions; do not infer success from prose alone.
writeFileSync(
  `${root}/agent-transcript.txt`,
  result.transcript || result.output || ''
)
writeFileSync(
  `${root}/agent-result.json`,
  JSON.stringify({
    ...result,
    output: undefined,
    transcript: undefined,
    entry: scenario.entry,
    harness: baseline.harness,
  })
)
writeFileSync(input.resultPath, JSON.stringify(result))
console.log(
  `__AGENT_RESULT__ ${JSON.stringify({ ok: result.ok, error: result.error })}`
)
