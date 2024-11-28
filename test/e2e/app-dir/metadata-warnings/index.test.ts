import { nextTestSetup } from 'e2e-utils'

const METADATA_BASE_WARN_STRING =
  'metadataBase property in metadata export is not set for resolving social open graph or twitter images,'

describe('app dir - metadata missing metadataBase', () => {
  const { next, isNextDev, skipped } = nextTestSetup({
    files: __dirname,
    skipDeployment: true,
  })

  if (skipped) {
    return
  }

  // If it's start mode, we get the whole logs since they're from build process.
  // If it's development mode, we get the logs after request
  function getCliOutput(logStartPosition: number) {
    return isNextDev ? next.cliOutput.slice(logStartPosition) : next.cliOutput
  }

  if (isNextDev) {
    it('should not warn metadataBase is missing if there is only absolute url', async () => {
      const logStartPosition = next.cliOutput.length
      await next.fetch('/absolute-url-og')
      const output = getCliOutput(logStartPosition)
      expect(output).not.toInclude(METADATA_BASE_WARN_STRING)
    })
  }

  it('should show warning in vercel deployment output in default build output mode', async () => {
    const logStartPosition = next.cliOutput.length
    await next.fetch('/og-image-convention')
    const output = getCliOutput(logStartPosition)

    if (isNextDev) {
      expect(output).not.toInclude(METADATA_BASE_WARN_STRING)
    } else {
      expect(output).toInclude(METADATA_BASE_WARN_STRING)
    }
  })

  it('should warn metadataBase is missing and a relative URL is used', async () => {
    const logStartPosition = next.cliOutput.length
    await next.fetch('/relative-url-og')
    const output = getCliOutput(logStartPosition)

    expect(output).toInclude(METADATA_BASE_WARN_STRING)
  })

  it('should warn for unsupported metadata properties', async () => {
    const logStartPosition = next.cliOutput.length
    await next.fetch('/unsupported-metadata')
    const output = getCliOutput(logStartPosition)
    expect(output).toInclude(
      'Unsupported metadata themeColor is configured in metadata export in /unsupported-metadata. Please move it to viewport'
    )
    expect(output).toInclude(
      'Read more: https://nextjs.org/docs/app/api-reference/functions/generate-viewport'
    )
  })

  it('should not warn for viewport properties during manually merging metadata', async () => {
    const outputLength = next.cliOutput.length
    await next.fetch('/merge')
    // Should not log the unsupported metadata viewport warning in the output
    // during merging the metadata, if the value is still nullable.
    const output = next.cliOutput.slice(outputLength)
    expect(output).not.toContain('Unsupported metadata viewport')
  })
})
