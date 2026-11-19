import type { Sandbox } from '@vercel/agent-eval'

/** Record coding time separately from setup, grading, and page measurements. */
export function recordAgentTime(sandbox: Sandbox): void {
  const run = sandbox.runCommand.bind(sandbox)
  sandbox.runCommand = async (command, args, options) => {
    if (command !== 'node' || args?.[0] !== '__agent_eval__/run.mjs') {
      return run(command, args, options)
    }
    const started = Date.now()
    try {
      return await run(command, args, options)
    } finally {
      const seconds = (Date.now() - started) / 1000
      try {
        await run('node', [
          '-e',
          "require('node:fs').writeFileSync('.eval-metrics.json', process.argv[1])",
          JSON.stringify({ agentSeconds: seconds }),
        ])
      } catch {
        console.warn('Coding time unavailable after Sandbox teardown')
      }
    }
  }
}
