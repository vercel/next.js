import { spawnSync } from 'child_process'
import { join, relative } from 'path'
import { FileRef, nextTestSetup } from 'e2e-utils'

describe.each(['9.37.0', '10.11.0'])(
  'eslint-config-next with ESLint %s',
  (eslintVersion) => {
    const { next } = nextTestSetup({
      files: new FileRef(join(__dirname, 'fixture')),
      skipStart: true,
      dependencies: {
        eslint: eslintVersion,
        'eslint-config-next': 'workspace:*',
        'eslint-plugin-react': '7.37.5',
      },
    })

    function lint(directory: string) {
      const cwd = join(next.testDir, directory)
      const { stdout, stderr } = spawnSync(
        'pnpm',
        ['eslint', '--format', 'json', '.'],
        { cwd, encoding: 'utf8' }
      )

      let results: {
        filePath: string
        messages: { ruleId: string | null; line: number; message: string }[]
      }[]
      try {
        results = JSON.parse(stdout)
      } catch {
        throw new Error(`ESLint failed:\n${stderr}`)
      }

      // TEMP CI DEBUG
      require('console').log(
        'DEBUG eslint',
        directory,
        JSON.stringify({
          stderr,
          unresolved: results.flatMap(({ filePath, messages }) =>
            messages
              .filter(({ ruleId }) => ruleId === 'import/no-unresolved')
              .map(({ line, message }) => `${filePath}:${line} ${message}`)
          ),
          probe: spawnSync(
            process.execPath,
            [
              '-e',
              `const {createRequire}=require('module');const req=createRequire(require.resolve('eslint-config-next'));const p=req.resolve('eslint-import-resolver-typescript');console.log('resolver at',p);const r=req(p);console.log(JSON.stringify(r.resolve('@/page',require('path').resolve('imports.ts'),{alwaysTryTypes:true})));console.log('cwd',process.cwd());console.log('env',JSON.stringify(Object.fromEntries(Object.entries(process.env).filter(([k])=>/NODE|TS_|TSC|PNPM|npm_config/i.test(k)))))`,
            ],
            { cwd, encoding: 'utf8' }
          ),
        })
      )

      return results
        .flatMap(({ filePath, messages }) =>
          messages.map(
            ({ ruleId, line, message }) =>
              `${relative(cwd, filePath).replace(/\\/g, '/')}:${line} ${ruleId ?? message}`
          )
        )
        .sort()
    }

    it('should lint a JavaScript project', () => {
      expect(lint('.')).toEqual([
        'app/page.jsx:2 @next/next/no-img-element',
        'app/page.jsx:2 jsx-a11y/alt-text',
        'components/widget.jsx:10 import/no-anonymous-default-export',
        'components/widget.jsx:10 react/display-name',
        'components/widget.jsx:5 react-hooks/rules-of-hooks',
        'components/widget.jsx:7 react/jsx-no-undef',
        'lib/globals.js:2 no-unused-vars',
        'lib/globals.js:3 no-global-assign',
        'lib/globals.js:3 no-implicit-globals',
        // Only `missing`. `injected` and `configured` are declared globals.
        'lib/globals.js:3 no-undef',
        'lib/globals.js:4 import/no-default-export',
        // Only `disabled`, which is turned off in the config.
        'lib/overrides.js:2 no-undef',
        'lib/script.js:1 no-implicit-globals',
        'lib/script.js:3 no-implicit-globals',
        'lib/script.js:3 no-undef',
      ])
    })

    it('should lint a TypeScript project', () => {
      expect(lint('typescript')).toEqual([
        'globals.js:2 import/no-anonymous-default-export',
        // Only `missing`. `injected` is a declared global.
        'globals.js:2 no-undef',
        // Only `./missing`. `@/page` resolves through the tsconfig paths.
        'imports.ts:2 import/no-unresolved',
        'page.tsx:1 @typescript-eslint/no-explicit-any',
        'page.tsx:2 @typescript-eslint/no-unused-vars',
        'page.tsx:5 @next/next/no-img-element',
        'page.tsx:5 jsx-a11y/alt-text',
      ])
    })
  }
)
