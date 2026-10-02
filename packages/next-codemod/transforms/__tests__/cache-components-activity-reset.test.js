/* global jest */
jest.autoMockOff()

const {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} = require('fs')
const { join } = require('path')
const { tmpdir } = require('os')
const transformer = require('../cache-components-activity-reset').default

function transform(path, source, options = { dry: true }) {
  return transformer({ path, source }, {}, options)
}

describe('cache-components-activity-reset', () => {
  it('wraps a page and imports the generated reset component', () => {
    const source = `export default function Page() {
  return <p>Hello</p>
}
`

    expect(transform('/project/app/page.tsx', source)).toMatchInlineSnapshot(`
"// TODO: Cache Components adoption. Remove this wrapper after verifying this route no longer relies on unmounting to reset state.
// See: https://nextjs.org/docs/app/guides/preserving-ui-state
import { CacheComponentsActivityReset } from \"./_next-cache-components/activity-reset\";

export default function Page() {
  return <CacheComponentsActivityReset><p>Hello</p></CacheComponentsActivityReset>;
}
"
`)
  })

  it('uses a relative import for a nested layout', () => {
    const source = `import type { ReactNode } from 'react'

export default function Layout({ children }: { children: ReactNode }) {
  return <section>{children}</section>
}
`

    expect(transform('/project/app/dashboard/settings/layout.tsx', source))
      .toMatchInlineSnapshot(`
"import type { ReactNode } from 'react'

// TODO: Cache Components adoption. Remove this wrapper after verifying this route no longer relies on unmounting to reset state.
// See: https://nextjs.org/docs/app/guides/preserving-ui-state
import { CacheComponentsActivityReset } from \"../../_next-cache-components/activity-reset\";

export default function Layout({ children }: { children: ReactNode }) {
  return <CacheComponentsActivityReset><section>{children}</section></CacheComponentsActivityReset>;
}
"
`)
  })

  it('wraps a parenthesized multi-line return without stray parentheses', () => {
    const source = `export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}
`

    const output = transform('/project/app/layout.tsx', source)
    expect(output).not.toMatch(/>\(</)
    expect(output).not.toMatch(/>\)</)
    expect(output).toMatchInlineSnapshot(`
"// TODO: Cache Components adoption. Remove this wrapper after verifying this route no longer relies on unmounting to reset state.
// See: https://nextjs.org/docs/app/guides/preserving-ui-state
import { CacheComponentsActivityReset } from \"./_next-cache-components/activity-reset\";

export default function RootLayout({ children }) {
  return (
    <CacheComponentsActivityReset><html lang=\"en\">
        <body>{children}</body>
      </html></CacheComponentsActivityReset>
  );
}
"
`)
  })

  it('wraps each top-level return without touching nested functions', () => {
    const source = `export default function Page({ ready }) {
  function getLabel() {
    return 'ready'
  }

  if (!ready) return null
  return <p>{getLabel()}</p>
}
`

    const output = transform('/project/app/page.tsx', source)
    expect(output).toContain(
      'if (!ready) return <CacheComponentsActivityReset>{null}</CacheComponentsActivityReset>;'
    )
    expect(output).toContain(
      'return <CacheComponentsActivityReset><p>{getLabel()}</p></CacheComponentsActivityReset>;'
    )
    expect(output).toContain("return 'ready'")
  })

  it('wraps an identifier default export', () => {
    const source = `const Page = () => <p>Hello</p>

export default Page
`

    expect(transform('/project/app/page.tsx', source)).toContain(
      'const Page = () => <CacheComponentsActivityReset><p>Hello</p></CacheComponentsActivityReset>'
    )
  })

  it('wraps a component passed to a higher-order component', () => {
    const source = `function Page() {
  return <p>Hello</p>
}

export default withPage(Page)
`

    expect(transform('/project/app/page.tsx', source)).toContain(
      'return <CacheComponentsActivityReset><p>Hello</p></CacheComponentsActivityReset>;'
    )
  })

  it('uses createElement in TypeScript files without JSX support', () => {
    const source = `export default function Page() {
  return null
}
`

    const output = transform('/project/app/page.ts', source)
    expect(output).toContain(
      'import { createElement as createElementActivityReset } from "react";'
    )
    expect(output).toContain(
      'return createElementActivityReset(CacheComponentsActivityReset, null, null);'
    )
  })

  it('is idempotent', () => {
    const source = `import { CacheComponentsActivityReset } from './_next-cache-components/activity-reset'

export default function Page() {
  return <CacheComponentsActivityReset><p>Hello</p></CacheComponentsActivityReset>
}
`

    expect(transform('/project/app/page.tsx', source)).toBe(source)
  })

  it('leaves unresolved default exports and non-route files unchanged', () => {
    const unsupported = `export default getPage()\n`
    const component = `export default function Card() { return <p>Card</p> }\n`

    expect(transform('/project/app/page.tsx', unsupported)).toBe(unsupported)
    expect(transform('/project/app/components/card.tsx', component)).toBe(
      component
    )
  })

  it('creates the shared client component', () => {
    const directory = mkdtempSync(join(tmpdir(), 'activity-reset-codemod-'))
    const appDirectory = join(directory, 'app')
    const pagePath = join(appDirectory, 'page.tsx')
    const source = `export default function Page() { return <p>Hello</p> }\n`

    mkdirSync(appDirectory, { recursive: true })
    writeFileSync(join(directory, 'tsconfig.json'), '{}')
    writeFileSync(pagePath, source)

    const previousNodeEnv = process.env.NODE_ENV
    process.env.NODE_ENV = 'production'
    try {
      transform(pagePath, source, { dry: false })
      const resetSource = readFileSync(
        join(appDirectory, '_next-cache-components', 'activity-reset.tsx'),
        'utf8'
      )

      expect(resetSource).toContain("'use client'")
      expect(resetSource).toContain('const { bfcacheId } = useRouter()')
      expect(resetSource).toContain('<Fragment key={bfcacheId}>')
    } finally {
      process.env.NODE_ENV = previousNodeEnv
      rmSync(directory, { recursive: true, force: true })
    }
  })

  it('creates a JavaScript helper when the app has no TypeScript config', () => {
    const directory = mkdtempSync(join(tmpdir(), 'activity-reset-codemod-'))
    const appDirectory = join(directory, 'app')
    const pagePath = join(appDirectory, 'page.jsx')
    const source = `export default function Page() { return <p>Hello</p> }\n`

    mkdirSync(appDirectory, { recursive: true })
    writeFileSync(pagePath, source)

    const previousNodeEnv = process.env.NODE_ENV
    process.env.NODE_ENV = 'production'
    try {
      transform(pagePath, source, { dry: false })
      const resetSource = readFileSync(
        join(appDirectory, '_next-cache-components', 'activity-reset.jsx'),
        'utf8'
      )

      expect(resetSource).toContain("'use client'")
      expect(resetSource).not.toContain('type ReactNode')
      expect(resetSource).toContain('const { bfcacheId } = useRouter()')
    } finally {
      process.env.NODE_ENV = previousNodeEnv
      rmSync(directory, { recursive: true, force: true })
    }
  })
})
