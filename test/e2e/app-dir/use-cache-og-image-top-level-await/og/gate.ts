import { existsSync, writeFileSync } from 'node:fs'
import { watch } from 'node:fs/promises'
import { join } from 'node:path'

// Blocks module evaluation until the test opens the corresponding gate file.
// Gates are only armed when the test that orchestrates its own build enables
// them; by default (dev, deployments) this module resolves immediately and
// the fixture is a plain app with a top-level await. Gates are per-process,
// so that every evaluation of the module (during page data collection, and
// in each prerender worker) stalls until the test allows it to proceed.
// Deliberately avoids timers, which are treated as runtime data during
// prerendering.
export async function waitForGate(name: string): Promise<void> {
  if (process.env.NEXT_TEST_MODULE_GATES !== '1') return

  const gate = `${name}-${process.pid}`
  const openFile = join(process.cwd(), `${gate}.gate-open`)
  writeFileSync(join(process.cwd(), `${gate}.gate-waiting`), '')

  if (existsSync(openFile)) return

  for await (const _event of watch(process.cwd())) {
    if (existsSync(openFile)) return
  }
}
