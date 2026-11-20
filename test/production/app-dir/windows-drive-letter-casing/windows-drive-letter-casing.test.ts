/* eslint-env jest */
import { spawn } from 'child_process'

const isWindows = process.platform === 'win32'

;(isWindows ? describe : describe.skip)('windows-drive-letter-casing', () => {
  it('should successfully build and prerender when project dir and next entry point differ in drive-letter casing', async () => {
    const fixtureDir = __dirname
    const rootDrive = fixtureDir[0]
    const invertedDrive =
      rootDrive === rootDrive.toUpperCase()
        ? rootDrive.toLowerCase()
        : rootDrive.toUpperCase()

    const projectDir = invertedDrive + fixtureDir.slice(1)
    const nextBin = require.resolve('next/dist/bin/next')

    const result = await new Promise<{ code: number | null; output: string }>(
      (resolve) => {
        let output = ''
        const child = spawn(process.execPath, [nextBin, 'build', projectDir], {
          cwd: projectDir,
          env: {
            ...process.env,
            NODE_ENV: 'production',
          },
        })

        child.stdout?.on('data', (data) => {
          output += data.toString()
        })
        child.stderr?.on('data', (data) => {
          output += data.toString()
        })

        child.on('close', (code) => {
          resolve({ code, output })
        })
      }
    )

    expect(result.code).toBe(0)
    expect(result.output).not.toContain('Cannot read properties of null')
    expect(result.output).not.toContain('Next.js build worker exited with code')
  }, 60000)
})
