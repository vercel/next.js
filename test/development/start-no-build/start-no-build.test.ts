import { spawn } from 'child_process'

describe('next start without next build', () => {
  it('should show error when there is no production build', async () => {
    const appDir = __dirname

    const result = await new Promise<{ stdout: string; stderr: string }>(
      (resolve) => {
        const child = spawn('pnpm', ['next', 'start'], {
          cwd: appDir,
          env: {
            ...process.env,
            NODE_ENV: 'production',
          },
        })

        let stdout = ''
        let stderr = ''

        child.stdout?.on('data', (data) => {
          stdout += data.toString()
        })

        child.stderr?.on('data', (data) => {
          stderr += data.toString()
        })

        child.on('close', () => {
          resolve({ stdout, stderr })
        })

        // Timeout after 10 seconds
        setTimeout(() => {
          child.kill()
          resolve({ stdout, stderr })
        }, 10000)
      }
    )

    // The error message should appear in stdout (where Next.js logs errors)
    const combinedOutput = result.stdout + result.stderr
    expect(combinedOutput).toContain('Could not find a production build')
  })
})
