import { readFileSync, rmSync, writeFileSync } from 'node:fs'
import { startNextServer } from './__agent_eval__/next-test-utils.mjs'

const app = await startNextServer({
  mode: 'dev',
  port: 3100,
  detached: true,
  logFile: '/tmp/agent-057-next-dev.log',
})

const reportsResponse = await fetch(`${app.url}/reports/acme`)
if (!reportsResponse.ok) {
  await app.stop()
  throw new Error(`reports route failed to compile: ${reportsResponse.status}`)
}

writeFileSync(
  'lib/route-params.ts',
  readFileSync('lib/route-params.ts', 'utf8').replace(
    'return () =>',
    'return (_route: string) =>'
  )
)

const packageJson = JSON.parse(readFileSync('package.json', 'utf8'))
delete packageJson.scripts['eval:setup']
writeFileSync('package.json', `${JSON.stringify(packageJson, null, 2)}\n`)
rmSync(new URL(import.meta.url))
