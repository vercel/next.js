import { nextTestSetup } from 'e2e-utils'

const strictRouteTypes =
  process.env.__NEXT_EXPERIMENTAL_STRICT_ROUTE_TYPES === 'true'

describe('tsconfig.json verifier', () => {
  const { next, skipped } = nextTestSetup({
    files: __dirname,
    skipStart: true,
    skipDeployment: true,
  })
  if (skipped) return

  beforeEach(async () => {
    await next.deleteFile('tsconfig.json')
    await next.deleteFile('tsconfig.base.json')
  })

  afterEach(async () => {
    await next.deleteFile('tsconfig.json')
    await next.deleteFile('tsconfig.base.json')
  })

  it('Creates a default tsconfig.json when one is missing', async () => {
    expect(await next.hasFile('tsconfig.json')).toBe(false)
    const { exitCode } = await next.build()
    expect(exitCode).toBe(0)
    if (strictRouteTypes) {
      expect(await next.readFile('tsconfig.json')).toMatchInlineSnapshot(`
         "{
           "compilerOptions": {
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
             "module": "esnext",
             "esModuleInterop": true,
             "moduleResolution": "bundler",
             "resolveJsonModule": true,
             "isolatedModules": true,
             "jsx": "react-jsx",
             "plugins": [
               {
                 "name": "next"
               }
             ],
             "strictNullChecks": true
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
             "module": "esnext",
             "esModuleInterop": true,
             "moduleResolution": "bundler",
             "resolveJsonModule": true,
             "isolatedModules": true,
             "jsx": "react-jsx",
             "plugins": [
               {
                 "name": "next"
               }
             ],
             "strictNullChecks": true
           },
           "include": [
             "next-env.d.ts",
             ".next/types/**/*.ts",
             ".next/dev/types/**/*.ts",
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

  it('Works with an empty tsconfig.json (docs)', async () => {
    expect(await next.hasFile('tsconfig.json')).toBe(false)

    await next.patchFile('tsconfig.json', '')
    await new Promise((resolve) => setTimeout(resolve, 500))
    expect(await next.readFile('tsconfig.json')).toBe('')

    const { exitCode, cliOutput } = await next.build()
    expect(cliOutput).not.toContain('moduleResolution')
    expect(exitCode).toBe(0)

    if (strictRouteTypes) {
      expect(await next.readFile('tsconfig.json')).toMatchInlineSnapshot(`
         "{
           "compilerOptions": {
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
             "module": "esnext",
             "esModuleInterop": true,
             "moduleResolution": "bundler",
             "resolveJsonModule": true,
             "isolatedModules": true,
             "jsx": "react-jsx",
             "plugins": [
               {
                 "name": "next"
               }
             ],
             "strictNullChecks": true
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
             "module": "esnext",
             "esModuleInterop": true,
             "moduleResolution": "bundler",
             "resolveJsonModule": true,
             "isolatedModules": true,
             "jsx": "react-jsx",
             "plugins": [
               {
                 "name": "next"
               }
             ],
             "strictNullChecks": true
           },
           "include": [
             "next-env.d.ts",
             ".next/types/**/*.ts",
             ".next/dev/types/**/*.ts",
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

  it('Updates an existing tsconfig.json without losing comments', async () => {
    expect(await next.hasFile('tsconfig.json')).toBe(false)

    await next.patchFile(
      'tsconfig.json',
      `
      // top-level comment
      {
        // in-object comment 1
        "compilerOptions": {
          // in-object comment
          "esModuleInterop": false, // this should be true
          "module": "umd" // should not be umd
          // end-object comment
        }
        // in-object comment 2
      }
      // end comment
      `
    )
    await new Promise((resolve) => setTimeout(resolve, 500))
    const { exitCode } = await next.build()
    expect(exitCode).toBe(0)

    if (strictRouteTypes) {
      expect(await next.readFile('tsconfig.json')).toMatchInlineSnapshot(`
         "// top-level comment
         {
           // in-object comment 1
           "compilerOptions": {
             // in-object comment
             "esModuleInterop": true, // this should be true
             "module": "esnext" // should not be umd
             // end-object comment
             ,
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
             "moduleResolution": "bundler",
             "resolveJsonModule": true,
             "isolatedModules": true,
             "jsx": "react-jsx",
             "plugins": [
               {
                 "name": "next"
               }
             ],
             "strictNullChecks": true
           }
           // in-object comment 2
           ,
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
         // end comment
         "
        `)
    } else {
      expect(await next.readFile('tsconfig.json')).toMatchInlineSnapshot(`
         "// top-level comment
         {
           // in-object comment 1
           "compilerOptions": {
             // in-object comment
             "esModuleInterop": true, // this should be true
             "module": "esnext" // should not be umd
             // end-object comment
             ,
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
             "moduleResolution": "bundler",
             "resolveJsonModule": true,
             "isolatedModules": true,
             "jsx": "react-jsx",
             "plugins": [
               {
                 "name": "next"
               }
             ],
             "strictNullChecks": true
           }
           // in-object comment 2
           ,
           "include": [
             "next-env.d.ts",
             ".next/types/**/*.ts",
             ".next/dev/types/**/*.ts",
             "**/*.mts",
             "**/*.ts",
             "**/*.tsx"
           ],
           "exclude": [
             "node_modules"
           ]
         }
         // end comment
         "
        `)
    }
  })

  // `module: commonjs` forces `moduleResolution: node`, which TypeScript 6
  // deprecates (TS5107). The commonjs case is tested in a separate describe
  // block below that pins TypeScript 5.9 until we stop emitting the deprecated
  // resolution. See the `tsconfig.json verifier 5.x` block at the end of this
  // file.

  it('allows you to set es2020 module mode', async () => {
    expect(await next.hasFile('tsconfig.json')).toBe(false)

    await next.patchFile(
      'tsconfig.json',
      `{ "compilerOptions": { "esModuleInterop": false, "module": "es2020" } }`
    )
    await new Promise((resolve) => setTimeout(resolve, 500))
    const { exitCode } = await next.build()
    expect(exitCode).toBe(0)

    if (strictRouteTypes) {
      expect(await next.readFile('tsconfig.json')).toMatchInlineSnapshot(`
         "{
           "compilerOptions": {
             "esModuleInterop": true,
             "module": "es2020",
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
             "moduleResolution": "bundler",
             "resolveJsonModule": true,
             "isolatedModules": true,
             "jsx": "react-jsx",
             "plugins": [
               {
                 "name": "next"
               }
             ],
             "strictNullChecks": true
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
             "esModuleInterop": true,
             "module": "es2020",
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
             "moduleResolution": "bundler",
             "resolveJsonModule": true,
             "isolatedModules": true,
             "jsx": "react-jsx",
             "plugins": [
               {
                 "name": "next"
               }
             ],
             "strictNullChecks": true
           },
           "include": [
             "next-env.d.ts",
             ".next/types/**/*.ts",
             ".next/dev/types/**/*.ts",
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

  it('allows you to set node16 moduleResolution mode', async () => {
    expect(await next.hasFile('tsconfig.json')).toBe(false)

    await next.patchFile(
      'tsconfig.json',
      `{ "compilerOptions": { "esModuleInterop": false, "moduleResolution": "node16", "module": "node16" } }`
    )
    await new Promise((resolve) => setTimeout(resolve, 500))
    const { exitCode, cliOutput } = await next.build()
    expect(cliOutput).not.toContain('moduleResolution')
    expect(exitCode).toBe(0)

    if (strictRouteTypes) {
      expect(await next.readFile('tsconfig.json')).toMatchInlineSnapshot(`
         "{
           "compilerOptions": {
             "esModuleInterop": true,
             "moduleResolution": "node16",
             "module": "node16",
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
             "resolveJsonModule": true,
             "isolatedModules": true,
             "jsx": "react-jsx",
             "plugins": [
               {
                 "name": "next"
               }
             ],
             "strictNullChecks": true
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
             "esModuleInterop": true,
             "moduleResolution": "node16",
             "module": "node16",
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
             "resolveJsonModule": true,
             "isolatedModules": true,
             "jsx": "react-jsx",
             "plugins": [
               {
                 "name": "next"
               }
             ],
             "strictNullChecks": true
           },
           "include": [
             "next-env.d.ts",
             ".next/types/**/*.ts",
             ".next/dev/types/**/*.ts",
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

  it('allows you to set bundler moduleResolution mode', async () => {
    expect(await next.hasFile('tsconfig.json')).toBe(false)

    await next.patchFile(
      'tsconfig.json',
      `{ "compilerOptions": { "esModuleInterop": false, "moduleResolution": "bundler" } }`
    )
    await new Promise((resolve) => setTimeout(resolve, 500))
    const { exitCode, cliOutput } = await next.build()
    expect(cliOutput).not.toContain('moduleResolution')
    expect(exitCode).toBe(0)

    if (strictRouteTypes) {
      expect(await next.readFile('tsconfig.json')).toMatchInlineSnapshot(`
         "{
           "compilerOptions": {
             "esModuleInterop": true,
             "moduleResolution": "bundler",
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
             "module": "esnext",
             "resolveJsonModule": true,
             "isolatedModules": true,
             "jsx": "react-jsx",
             "plugins": [
               {
                 "name": "next"
               }
             ],
             "strictNullChecks": true
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
             "esModuleInterop": true,
             "moduleResolution": "bundler",
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
             "module": "esnext",
             "resolveJsonModule": true,
             "isolatedModules": true,
             "jsx": "react-jsx",
             "plugins": [
               {
                 "name": "next"
               }
             ],
             "strictNullChecks": true
           },
           "include": [
             "next-env.d.ts",
             ".next/types/**/*.ts",
             ".next/dev/types/**/*.ts",
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

  it('allows you to set target mode', async () => {
    expect(await next.hasFile('tsconfig.json')).toBe(false)

    await next.patchFile(
      'tsconfig.json',
      `{ "compilerOptions": { "target": "es2022" } }`
    )
    await new Promise((resolve) => setTimeout(resolve, 500))
    const { exitCode, cliOutput } = await next.build()
    expect(cliOutput).not.toContain('target')
    expect(exitCode).toBe(0)

    if (strictRouteTypes) {
      expect(await next.readFile('tsconfig.json')).toMatchInlineSnapshot(`
         "{
           "compilerOptions": {
             "target": "es2022",
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
             "module": "esnext",
             "esModuleInterop": true,
             "moduleResolution": "bundler",
             "resolveJsonModule": true,
             "isolatedModules": true,
             "jsx": "react-jsx",
             "plugins": [
               {
                 "name": "next"
               }
             ],
             "strictNullChecks": true
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
             "target": "es2022",
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
             "module": "esnext",
             "esModuleInterop": true,
             "moduleResolution": "bundler",
             "resolveJsonModule": true,
             "isolatedModules": true,
             "jsx": "react-jsx",
             "plugins": [
               {
                 "name": "next"
               }
             ],
             "strictNullChecks": true
           },
           "include": [
             "next-env.d.ts",
             ".next/types/**/*.ts",
             ".next/dev/types/**/*.ts",
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

  it('allows you to set node16 module mode', async () => {
    expect(await next.hasFile('tsconfig.json')).toBe(false)

    await next.patchFile(
      'tsconfig.json',
      `{ "compilerOptions": { "esModuleInterop": false, "module": "node16", "moduleResolution": "node16" } }`
    )
    await new Promise((resolve) => setTimeout(resolve, 500))
    const { exitCode, cliOutput } = await next.build()
    expect(cliOutput).not.toContain('moduleResolution')
    expect(exitCode).toBe(0)

    if (strictRouteTypes) {
      expect(await next.readFile('tsconfig.json')).toMatchInlineSnapshot(`
         "{
           "compilerOptions": {
             "esModuleInterop": true,
             "module": "node16",
             "moduleResolution": "node16",
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
             "resolveJsonModule": true,
             "isolatedModules": true,
             "jsx": "react-jsx",
             "plugins": [
               {
                 "name": "next"
               }
             ],
             "strictNullChecks": true
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
             "esModuleInterop": true,
             "module": "node16",
             "moduleResolution": "node16",
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
             "resolveJsonModule": true,
             "isolatedModules": true,
             "jsx": "react-jsx",
             "plugins": [
               {
                 "name": "next"
               }
             ],
             "strictNullChecks": true
           },
           "include": [
             "next-env.d.ts",
             ".next/types/**/*.ts",
             ".next/dev/types/**/*.ts",
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

  it('allows you to set verbatimModuleSyntax true without adding isolatedModules', async () => {
    expect(await next.hasFile('tsconfig.json')).toBe(false)

    await next.patchFile(
      'tsconfig.json',
      `{ "compilerOptions": { "verbatimModuleSyntax": true } }`
    )
    await new Promise((resolve) => setTimeout(resolve, 500))
    const { exitCode, cliOutput } = await next.build()
    expect(cliOutput).not.toContain('isolatedModules')
    expect(exitCode).toBe(0)

    if (strictRouteTypes) {
      expect(await next.readFile('tsconfig.json')).toMatchInlineSnapshot(`
         "{
           "compilerOptions": {
             "verbatimModuleSyntax": true,
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
             "module": "esnext",
             "esModuleInterop": true,
             "moduleResolution": "bundler",
             "resolveJsonModule": true,
             "jsx": "react-jsx",
             "plugins": [
               {
                 "name": "next"
               }
             ],
             "strictNullChecks": true
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
             "verbatimModuleSyntax": true,
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
             "module": "esnext",
             "esModuleInterop": true,
             "moduleResolution": "bundler",
             "resolveJsonModule": true,
             "jsx": "react-jsx",
             "plugins": [
               {
                 "name": "next"
               }
             ],
             "strictNullChecks": true
           },
           "include": [
             "next-env.d.ts",
             ".next/types/**/*.ts",
             ".next/dev/types/**/*.ts",
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

  it('allows you to set verbatimModuleSyntax true via extends without adding isolatedModules', async () => {
    expect(await next.hasFile('tsconfig.json')).toBe(false)
    expect(await next.hasFile('tsconfig.base.json')).toBe(false)

    await next.patchFile(
      'tsconfig.base.json',
      `{ 
        "compilerOptions": {
           "verbatimModuleSyntax": true,
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
           "module": "esnext",
           "esModuleInterop": true,
           "moduleResolution": "bundler",
           "resolveJsonModule": true,
           "jsx": "react-jsx",
           "plugins": [
             {
               "name": "next"
             }
           ],
           "strictNullChecks": true
         },
         "include": [
           "next-env.d.ts",
           ".next/types/**/*.ts",
           "**/*.mts",
           "**/*.ts",
           "**/*.tsx"
         ],
         "exclude": [
           "node_modules"
         ]
        }`
    )
    await next.patchFile(
      'tsconfig.json',
      `{ "extends": "./tsconfig.base.json" }`
    )
    await new Promise((resolve) => setTimeout(resolve, 500))
    const { exitCode, cliOutput } = await next.build()
    expect(cliOutput).not.toContain('isolatedModules')
    expect(exitCode).toBe(0)

    expect(await next.readFile('tsconfig.json')).toMatchInlineSnapshot(
      `"{ "extends": "./tsconfig.base.json" }"`
    )
  })

  it('allows you to extend another configuration file', async () => {
    expect(await next.hasFile('tsconfig.json')).toBe(false)
    expect(await next.hasFile('tsconfig.base.json')).toBe(false)

    await next.patchFile(
      'tsconfig.base.json',
      `
      {
        "compilerOptions": {
          "lib": [
            "dom",
            "dom.iterable",
            "esnext"
          ],
          "allowJs": true,
          "skipLibCheck": true,
          "strict": false,
          "forceConsistentCasingInFileNames": true,
          "noEmit": true,
          "incremental": true,
          "esModuleInterop": true,
          "module": "esnext",
          "moduleResolution": "bundler",
          "resolveJsonModule": true,
          "isolatedModules": true,
          "jsx": "react-jsx",
          "plugins": [
            {
              "name": "next"
            }
          ],
          "strictNullChecks": true
        },
        "include": [
          "next-env.d.ts",
          ".next/types/**/*.ts",
          "**/*.mts",
          "**/*.ts",
          "**/*.tsx"
        ],
        "exclude": [
          "node_modules"
        ]
      }
      `
    )
    await new Promise((resolve) => setTimeout(resolve, 500))

    await next.patchFile(
      'tsconfig.json',
      `{ "extends": "./tsconfig.base.json" }`
    )
    await new Promise((resolve) => setTimeout(resolve, 500))

    const { exitCode, cliOutput } = await next.build()
    expect(cliOutput).not.toContain('moduleResolution')
    expect(exitCode).toBe(0)

    expect(await next.readFile('tsconfig.json')).toMatchInlineSnapshot(
      `"{ "extends": "./tsconfig.base.json" }"`
    )
  })

  it('creates compilerOptions when you extend another config', async () => {
    expect(await next.hasFile('tsconfig.json')).toBe(false)
    expect(await next.hasFile('tsconfig.base.json')).toBe(false)

    await next.patchFile(
      'tsconfig.base.json',
      `
      {
        "compilerOptions": {
          "lib": [
            "dom",
            "dom.iterable",
            "esnext"
          ],
          "allowJs": true,
          "skipLibCheck": true,
          "strict": false,
          "forceConsistentCasingInFileNames": true,
          "noEmit": true,
          "esModuleInterop": true,
          "module": "esnext",
          "moduleResolution": "bundler",
          "resolveJsonModule": true,
          "isolatedModules": true,
          "jsx": "react-jsx",
          "plugins": [
            {
              "name": "next"
            }
          ],
          "strictNullChecks": true
        },
        "include": [
          "next-env.d.ts",
          ".next/types/**/*.ts",
          "**/*.mts",
          "**/*.ts",
          "**/*.tsx"
        ],
        "exclude": [
          "node_modules"
        ]
      }
      `
    )
    await new Promise((resolve) => setTimeout(resolve, 500))

    await next.patchFile(
      'tsconfig.json',
      `{ "extends": "./tsconfig.base.json" }`
    )
    await new Promise((resolve) => setTimeout(resolve, 500))

    const { exitCode, cliOutput } = await next.build()
    expect(cliOutput).not.toContain('moduleResolution')
    expect(exitCode).toBe(0)

    expect(await next.readFile('tsconfig.json')).toMatchInlineSnapshot(
      `"{ "extends": "./tsconfig.base.json" }"`
    )
  })

  // TODO: Enable this test when repo has upgraded to TypeScript 5.4. Currently tested as E2E: tsconfig-module-preserve
  it.skip('allows you to skip moduleResolution, esModuleInterop and resolveJsonModule when using "module: preserve"', async () => {
    expect(await next.hasFile('tsconfig.json')).toBe(false)

    await next.patchFile(
      'tsconfig.json',
      `{ "compilerOptions": { "module": "preserve" } }`
    )
    await new Promise((resolve) => setTimeout(resolve, 500))
    const { exitCode, cliOutput } = await next.build()
    expect(cliOutput).not.toContain('moduleResolution')
    expect(cliOutput).not.toContain('esModuleInterop')
    expect(cliOutput).not.toContain('resolveJsonModule')
    expect(exitCode).toBe(0)

    if (strictRouteTypes) {
      expect(await next.readFile('tsconfig.json')).toMatchInlineSnapshot()
    } else {
      expect(await next.readFile('tsconfig.json')).toMatchInlineSnapshot()
    }
  })
})

// `module: commonjs` forces Next.js to emit `moduleResolution: node`, which
// TypeScript 6 deprecates (TS5107). Pin TypeScript 5.9 for this case until we
// stop emitting the deprecated resolution.
describe('tsconfig.json verifier 5.x', () => {
  const { next, skipped } = nextTestSetup({
    files: __dirname,
    skipStart: true,
    dependencies: {
      typescript: '5.9.3',
    },
    skipDeployment: true,
  })
  if (skipped) return

  beforeEach(async () => {
    await next.deleteFile('tsconfig.json')
    await next.deleteFile('tsconfig.base.json')
  })

  afterEach(async () => {
    await next.deleteFile('tsconfig.json')
    await next.deleteFile('tsconfig.base.json')
  })

  it('allows you to set commonjs module mode', async () => {
    expect(await next.hasFile('tsconfig.json')).toBe(false)

    await next.patchFile(
      'tsconfig.json',
      `{ "compilerOptions": { "esModuleInterop": false, "module": "commonjs" } }`
    )
    await new Promise((resolve) => setTimeout(resolve, 500))
    const { exitCode } = await next.build()
    expect(exitCode).toBe(0)

    if (strictRouteTypes) {
      expect(await next.readFile('tsconfig.json')).toMatchInlineSnapshot(`
         "{
           "compilerOptions": {
             "esModuleInterop": true,
             "module": "commonjs",
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
             "moduleResolution": "node",
             "resolveJsonModule": true,
             "isolatedModules": true,
             "jsx": "react-jsx",
             "plugins": [
               {
                 "name": "next"
               }
             ],
             "strictNullChecks": true
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
             "esModuleInterop": true,
             "module": "commonjs",
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
             "moduleResolution": "node",
             "resolveJsonModule": true,
             "isolatedModules": true,
             "jsx": "react-jsx",
             "plugins": [
               {
                 "name": "next"
               }
             ],
             "strictNullChecks": true
           },
           "include": [
             "next-env.d.ts",
             ".next/types/**/*.ts",
             ".next/dev/types/**/*.ts",
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
