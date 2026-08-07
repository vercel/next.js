import assert from 'assert'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { command } from '../shell.js'

async function withTempScript(
  scriptContents: string,
  fn: (scriptPath: string) => Promise<void>
) {
  const dir = await mkdtemp(join(tmpdir(), 'devlow-shell-test-'))
  const scriptPath = join(dir, 'script.js')

  try {
    await writeFile(scriptPath, scriptContents, 'utf8')
    await fn(scriptPath)
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
}

test('waitForOutput handles sequential waits after buffered output', async () => {
  await withTempScript(
    `
console.log('FIRST_MARKER')
console.log('SECOND_MARKER')
setTimeout(() => {}, 1000)
`,
    async (scriptPath) => {
      const shell = command('node', [scriptPath])

      try {
        const first = await shell.waitForOutput(/FIRST_MARKER\n/, {
          timeoutMs: 2_000,
        })
        assert.equal(first[0], 'FIRST_MARKER\n')
        const second = await shell.waitForOutput(/SECOND_MARKER\n/, {
          timeoutMs: 2_000,
        })
        assert.equal(second[0], 'SECOND_MARKER\n')
      } finally {
        await shell.kill()
      }
    }
  )
})

test('waitForOutput times out when output never appears', async () => {
  await withTempScript(
    `
console.log('FIRST_MARKER')
setTimeout(() => {}, 1000)
`,
    async (scriptPath) => {
      const shell = command('node', [scriptPath])

      try {
        await shell.waitForOutput(/FIRST_MARKER\n/, {
          timeoutMs: 2_000,
        })

        await assert.rejects(
          shell.waitForOutput(/NEVER_SEEN\n/, { timeoutMs: 100 }),
          /Timed out waiting for output matching/
        )
      } finally {
        await shell.kill()
      }
    }
  )
})
