import { nextTestSetup } from 'e2e-utils'
import stripAnsi from 'strip-ansi'

// Only Turbopack prints these warnings
;(process.env.IS_TURBOPACK_TEST ? describe : describe.skip)(
  'build-tracing-message',
  () => {
    const { next } = nextTestSetup({
      files: __dirname,
      skipStart: true,
    })

    it('should warn when tracing all files in the project', async () => {
      const { exitCode } = await next.build()
      expect(exitCode).toBe(0)

      let output = next.cliOutput
        .slice(
          next.cliOutput.indexOf('Turbopack build encountered'),
          next.cliOutput.indexOf('✓ Compiled successfully')
        )
        .trim()

      expect(stripAnsi(output)).toMatchInlineSnapshot(`
       "Turbopack build encountered 1 warnings:
       ./app/join-cwd.js:4:10
       Encountered unexpected file in NFT list
         2 |
         3 | export default function (f) {
       > 4 |   return path.join(process.cwd(), f)
           |          ^^^^^^^^^^^^^^^^^^^^^^^^^^^
         5 | }
         6 |

       This import traced the next.config.js file which indicates that the whole project was traced unintentionally. Somewhere in the import trace below, there are:
       - filesystem operations (like path.join, path.resolve or fs.readFile), or
       - very dynamic requires (like require('./' + foo)).
       To resolve this, you can
       - remove them if possible, or
       - only use them in development, or
       - make sure they are statically scoped to some subfolder: path.join(process.cwd(), 'data', bar), or
       - add ignore comments: path.join(/*turbopackIgnore: true*/ process.cwd(), bar)

       Import trace:
         Server Component:
           ./app/join-cwd.js
           ./app/page.js"
      `)
    })
  }
)
