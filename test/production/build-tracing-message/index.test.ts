import { nextTestSetup } from 'e2e-utils'

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

      expect(output).toMatchInlineSnapshot(`
       "Turbopack build encountered 1 warnings:
       ./next.config.js
       Encountered unexpected file in NFT list
       A file was traced that indicates that the whole project was traced unintentionally. Somewhere in the import trace below, there are:
       - filesystem operations (like path.join, path.resolve or fs.readFile), or
       - very dynamic requires (like require('./' + foo)).
       To resolve this, you can
       - remove them if possible, or
       - only use them in development, or
       - make sure they are statically scoped to some subfolder: path.join(process.cwd(), 'data', bar), or
       - add ignore comments: path.join(/*turbopackIgnore: true*/ process.cwd(), bar)

       Import trace:
         Server Component:
           ./next.config.js
           ./app/join-cwd.js
           ./app/page.js"
      `)
    })
  }
)
