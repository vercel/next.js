import { spawn } from 'child_process'

it('spawns a process with a dynamic program', async () => {
  const program = ['ls']
  const proc = spawn(program[0], ['-la'])

  const code = await new Promise((resolve, reject) => {
    proc.on('error', reject)
    proc.on('close', resolve)
  })
  expect(code).toBe(0)
})
