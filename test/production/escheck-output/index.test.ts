import { createNext } from 'e2e-utils'
import { NextInstance } from 'test/lib/next-modes/base'

describe('ES Check .next output', () => {
  let next: NextInstance
  afterEach(() => next.destroy())

  it('should emit ES2020 with default', async () => {
    next = await createNext({
      files: {
        'pages/index.js': 'export default function Page() { return "hi" }',
      },
      dependencies: { 'es-check': '7.0.1' },
      packageJson: {
        packageManager: 'npm@10.4.0',
        scripts: {
          build: 'next build && es-check es2020 .next/static/**/*.js',
        },
      },
      installCommand: 'npm i',
      buildCommand: 'npm run build',
    })
    expect(next.cliOutput).toContain(
      'info: ES-Check: there were no ES version matching errors!  🎉'
    )
  })
})
