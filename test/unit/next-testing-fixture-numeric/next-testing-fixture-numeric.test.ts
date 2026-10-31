import { execFile } from 'node:child_process'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { promisify } from 'node:util'

it('matches genuine numeric fixture dependencies, hooks, overrides and scopes in both modes', async () => {
  const temporary = await mkdtemp(join(tmpdir(), 'next-fixture-numeric-'))
  let complete = false
  try {
    const evidence = join(temporary, 'evidence')
    await promisify(execFile)(
      process.execPath,
      [join(__dirname, 'verify.mjs'), join(__dirname, '../../..'), evidence],
      { timeout: 390000, maxBuffer: 1024 * 1024 }
    )
    const verified = JSON.parse(
      await readFile(join(evidence, 'VERIFIED.json'), 'utf8')
    )
    expect(verified.profiles).toBe(2)
    expect(verified.cases).toBe(22)
    expect(verified.wholeAuthorRows).toBe(74)
    expect(verified.completePerContractGenuineModelsExact).toBe(true)
    expect(verified.allOwnersJoined).toBe(true)
    expect(verified.allInputsRemovedAfterOwnedReadersJoined).toBe(true)
    complete = true
  } catch (error) {
    throw new Error(`Numeric fixture evidence retained at ${temporary}`, {
      cause: error,
    })
  } finally {
    if (complete) await rm(temporary, { recursive: true, force: true })
  }
}, 420000)
