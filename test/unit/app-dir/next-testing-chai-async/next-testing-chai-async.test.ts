import { join } from 'node:path'

it('preserves async Chai receiver identities and guards after actual File disposal', async () => {
  const { execFile } = await import('node:child_process')
  const { promisify } = await import('node:util')
  const { stdout, stderr } = await promisify(execFile)(
    process.execPath,
    [join(__dirname, 'file.cjs'), process.cwd()],
    { timeout: 20000 }
  )
  expect(stderr).toBe('')
  expect(JSON.parse(stdout)).toEqual({
    cases: 17,
    sameAsyncReceiverIdentities: 16,
    latePropertyGuards: 16,
    lateInvocationGuards: 16,
    foreignGuards: 16,
    callbacks: 16,
    actualFileDisposalJoined: true,
  })
}, 25000)

it.each(['development', 'production'])(
  'matches complete genuine async Chai rows and outcomes in %s',
  async (mode) => {
    const { execFile } = await import('node:child_process')
    const { promisify } = await import('node:util')
    const { mkdtemp, readFile, rm } = await import('node:fs/promises')
    const { tmpdir } = await import('node:os')
    const directory = await mkdtemp(join(tmpdir(), 'next-chai-async-public-'))
    let completed = false
    try {
      const output = join(directory, 'observed')
      await promisify(execFile)(
        process.execPath,
        [join(__dirname, 'public.mjs'), 'source', process.cwd(), output, mode],
        { timeout: 125000, maxBuffer: 4 * 1024 * 1024 }
      )
      expect(
        JSON.parse(await readFile(join(output, 'VERIFIED.json'), 'utf8'))
      ).toMatchObject({
        exactGenuineAuthorRows: true,
        exactCaseStatesAndStandardCounts: true,
        exactGenuineFailureProjection: true,
        originalBoundsHeld: true,
        allOwnersJoined: true,
      })
      completed = true
    } finally {
      if (completed) await rm(directory, { recursive: true, force: true })
      else console.error('Retained async Chai observations at ' + directory)
    }
  },
  130000
)
