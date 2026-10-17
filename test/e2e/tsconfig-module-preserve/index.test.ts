import { nextTestSetup } from 'e2e-utils'
import { retry } from 'next-test-utils'
import stripAnsi from 'strip-ansi'

const strictRouteTypes =
  process.env.__NEXT_EXPERIMENTAL_STRICT_ROUTE_TYPES === 'true'

// Deploy mode exclusion: This suite reads local build artifacts that deployments do not expose.
// This test is skipped because it relies on `next.readFile`
// @force-gate !deploy
describe('tsconfig module: preserve', () => {
  const { next } = nextTestSetup({
    files: {
      'tsconfig.json': JSON.stringify({
        compilerOptions: { module: 'preserve' },
      }),
      'pages/index.tsx': `
        export default function Page() { 
          return <p>hello world</p>
        } 
      `,
    },
    dependencies: {
      typescript: '5.4.4',
    },
  })

  it('allows you to skip moduleResolution, esModuleInterop and resolveJsonModule when using "module: preserve"', async () => {
    let output = ''

    await retry(() => {
      output = stripAnsi(next.cliOutput)
      expect(output).toContain(
        'The following mandatory changes were made to your tsconfig.json'
      )
    })

    expect(output).not.toContain('moduleResolution')
    expect(output).not.toContain('esModuleInterop')
    expect(output).not.toContain('resolveJsonModule')

    if (strictRouteTypes) {
      expect(await next.readFile('tsconfig.json')).toMatchInlineSnapshot(`
       "{
         "compilerOptions": {
           "module": "preserve",
           "target": "ES2017",
           "lib": [
             "dom",
             "dom.iterable",
             "esnext"
           ],
           "allowJs": true,
           "skipLibCheck": true,
           "strict": false,
           "noEmit": true,
           "incremental": true,
           "isolatedModules": true,
           "jsx": "react-jsx"
         },
         "include": [
           "next-env.d.ts",
           "**/*.mts",
           "**/*.ts",
           "**/*.tsx"
         ],
         "exclude": [
           "node_modules"
         ]
       }
       "
      `)
    } else {
      expect(await next.readFile('tsconfig.json')).toMatchInlineSnapshot(`
       "{
         "compilerOptions": {
           "module": "preserve",
           "target": "ES2017",
           "lib": [
             "dom",
             "dom.iterable",
             "esnext"
           ],
           "allowJs": true,
           "skipLibCheck": true,
           "strict": false,
           "noEmit": true,
           "incremental": true,
           "isolatedModules": true,
           "jsx": "react-jsx"
         },
         "include": [
           "next-env.d.ts",
           "**/*.mts",
           "**/*.ts",
           "**/*.tsx"
         ],
         "exclude": [
           "node_modules"
         ]
       }
       "
      `)
    }
  })
})
