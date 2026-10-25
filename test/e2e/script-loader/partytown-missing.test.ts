import { nextTestSetup } from 'e2e-utils'
import { join } from 'path'

// @force-gate !dev
describe('script-loader - partytown-missing', () => {
  const { next, isNextDeploy } = nextTestSetup({
    files: join(__dirname, 'partytown-missing'),
    skipStart: true,
  })

  it('Error message is shown if Partytown is not installed locally', async () => {
    await expect(next.start()).rejects.toThrow()
    // Deployment build logs prefix each line with an ISO timestamp.
    const cliOutput = isNextDeploy
      ? next.cliOutput.replace(
          /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z {2}/gm,
          ''
        )
      : next.cliOutput

    expect(cliOutput.replace(/[\n\r]/g, '')).toMatch(
      /It looks like you're trying to use Partytown with next\/script but do not have the required package\(s\) installed.Please install Partytown by running:.*?(npm|pnpm|yarn) (install|add) (--save-dev|--dev) @builder\.io\/partytownIf you are not trying to use Partytown, please disable the experimental "nextScriptWorkers" flag in next\.config\.js\./
    )
  }, 240_000)
})
