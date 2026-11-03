import { execFile } from 'node:child_process'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { promisify } from 'node:util'

it('preserves actual test fixture contexts, lazy builtins and existing private/file behavior', async () => {
  const { stdout } = await promisify(execFile)(
    process.execPath,
    [join(__dirname, 'component.cjs'), join(__dirname, '../../..')],
    { timeout: 10000, maxBuffer: 4 * 1024 * 1024 }
  )
  expect(JSON.parse(stdout)).toMatchObject({
    controls: 8,
    allPassed: true,
    componentOnlyNotPublicQualification: true,
  })
}, 15000)

it('matches genuine context identity and getter reads across setup hooks body and cleanup in both Node modes', async () => {
  const temporary = await mkdtemp(join(tmpdir(), 'next-fixture-context-'))
  let complete = false
  try {
    const evidence = join(temporary, 'evidence')
    await promisify(execFile)(
      process.execPath,
      [
        join(__dirname, 'verify-node.mjs'),
        join(__dirname, '../../..'),
        evidence,
      ],
      { timeout: 260000, maxBuffer: 4 * 1024 * 1024 }
    )
    const verified = JSON.parse(
      await readFile(join(evidence, 'VERIFIED.json'), 'utf8')
    )
    expect(verified.allPassed).toBe(true)
    expect(verified.profiles).toHaveLength(2)
    expect(verified.actualCases).toBe(4)
    expect(verified.wholeRows).toBe(30)
    expect(verified.allPhysicalOwnersJoined).toBe(true)
    expect(verified.originalBoundsHeld).toBe(true)
    complete = true
  } catch (cause) {
    throw new Error(`Fixture context evidence retained at ${temporary}`, {
      cause,
    })
  } finally {
    if (complete) await rm(temporary, { recursive: true, force: true })
  }
}, 270000)
