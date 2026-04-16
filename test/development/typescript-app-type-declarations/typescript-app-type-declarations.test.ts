import fs from 'fs'
import path from 'path'
import { nextTestSetup } from 'e2e-utils'
import { retry, waitFor } from 'next-test-utils'

describe('typescript-app-type-declarations', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  it('should write a new next-env.d.ts if none exist', async () => {
    const prevContent = await next.readFile('next-env.d.ts')
    await next.deleteFile('next-env.d.ts')
    await next.render('/')
    await retry(async () => {
      const content = await next.readFile('next-env.d.ts')
      expect(content).toEqual(prevContent)
    })
  })

  it('should overwrite next-env.d.ts if an incorrect one exists', async () => {
    const prevContent = await next.readFile('next-env.d.ts')
    await next.patchFile('next-env.d.ts', prevContent + 'modification')
    await next.render('/')
    await retry(async () => {
      const content = await next.readFile('next-env.d.ts')
      expect(content).toEqual(prevContent)
    })
  })

  it('should not touch an existing correct next-env.d.ts', async () => {
    const envFile = path.join(next.testDir, 'next-env.d.ts')
    const prevContent = await next.readFile('next-env.d.ts')
    await next.patchFile('next-env.d.ts', prevContent)
    const prevStat = fs.statSync(envFile)
    await waitFor(1000)
    await next.render('/')
    const stat = fs.statSync(envFile)
    expect(stat.mtimeMs).toEqual(prevStat.mtimeMs)
  })
})
