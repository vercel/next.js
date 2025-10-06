import { nextTestSetup } from 'e2e-utils'
import { readFileSync } from 'fs'
import { nextLint } from 'next-test-utils'

describe('next-lint-eslint-formatter-compact', () => {
  const { next } = nextTestSetup({
    files: __dirname,
    dependencies: { eslint: '^8', 'eslint-config-next': 'canary' },
  })

  it('should format flag "compact" creates a file respecting the chosen format', async () => {
    const filePath = `${next.testDir}/output/output.txt`
    const { stdout, stderr } = await nextLint(
      next.testDir,
      ['--format', 'compact', '--output-file', filePath],
      {
        stdout: true,
        stderr: true,
      }
    )

    const cliOutput = stdout + stderr
    const fileOutput = readFileSync(filePath, 'utf8')

    expect(cliOutput).toContain(`The output file has been created: ${filePath}`)

    expect(fileOutput).toContain(`${next.testDir}/pages/bar.js`)
    expect(fileOutput).toContain(
      'img elements must have an alt prop, either with meaningful text, or an empty string for decorative images.'
    )
    expect(fileOutput).toContain(
      'Using `<img>` could result in slower LCP and higher bandwidth. Consider using `<Image />` from `next/image` or a custom image loader to automatically optimize images. This may incur additional usage or cost from your provider. See: https://nextjs.org/docs/messages/no-img-element'
    )

    expect(fileOutput).toContain(`${next.testDir}/pages/index.js`)
    expect(fileOutput).toContain(
      'Synchronous scripts should not be used. See: https://nextjs.org/docs/messages/no-sync-scripts'
    )
  })

  it('should show error message when the file path is a directory', async () => {
    const filePath = next.testDir
    const { stdout, stderr } = await nextLint(
      next.testDir,
      ['--format', 'compact', '--output-file', filePath],
      {
        stdout: true,
        stderr: true,
      }
    )

    const cliOutput = stdout + stderr
    console.log({ cliOutput })
    expect(cliOutput).toContain(
      `Cannot write to output file path, it is a directory: ${filePath}`
    )
  })
})
