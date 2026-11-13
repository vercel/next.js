import { spawn } from 'child_process'

it('spawns node with an inline script', async () => {
  const x = spawn(process.argv[0], ['-e', "console.log('foo');"])

  let stdout = ''
  x.stdout.on('data', (data) => {
    stdout += data
  })
  const code = await new Promise((resolve, reject) => {
    x.on('error', reject)
    x.on('close', resolve)
  })
  expect(code).toBe(0)
  expect(stdout).toBe('foo\n')
})
