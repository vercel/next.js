import { nextTestSetup } from 'e2e-utils'
import { readFile } from 'fs-extra'
import path from 'path'

describe('tsconfig module: Preserve', () => {
  const { next } = nextTestSetup({
    files: {
      'tsconfig.json': JSON.stringify({
        compilerOptions: { module: 'preserve' },
      }),
      'pages/index.js': `
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
    await next.stop()
    expect(next.cliOutput).not.toContain('moduleResolution')
    expect(next.cliOutput).not.toContain('esModuleInterop')
    expect(next.cliOutput).not.toContain('resolveJsonModule')

    const tsconfig = path.join(next.testDir, 'tsconfig.json')
    expect(await readFile(tsconfig, 'utf8')).toMatchInlineSnapshot(`
      "{
        "compilerOptions": {
          "module": "preserve",
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
          "jsx": "preserve"
        },
        "include": [
          "next-env.d.ts",
          "**/*.ts",
          "**/*.tsx"
        ],
        "exclude": [
          "node_modules"
        ]
      }
      "
    `)
  })
})
