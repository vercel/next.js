import { nextTestSetup } from 'e2e-utils'

describe('typed-links', () => {
  const { next, isNextStart, skipped } = nextTestSetup({
    files: __dirname,
    skipDeployment: true,
  })

  if (skipped) {
    return
  }

  it('should generate types for next/link', async () => {
    const dts = await next.readFile(`${next.distDir}/types/link.d.ts`)
    expect(dts).toContain(`declare module 'next/link'`)
  })

  it('should include handler route from app/api-test/route.ts in generated link route definitions', async () => {
    const dts = await next.readFile(`${next.distDir}/types/link.d.ts`)
    // Ensure the app route handler at app/api-test/route.ts ("/api-test") is present
    expect(dts).toContain('`/api-test`')
  })

  if (isNextStart) {
    it('should pass type checking with valid routes', async () => {
      await next.stop()
      await next.patchFile(
        'app/valid-links.tsx',
        `
import Link from 'next/link'

export default function ValidLinks() {
  return (
    <div>
      <Link href="/">Simple Route</Link>
      <Link href="/dashboard">Simple Route</Link>
      <Link href="/project/123">Dynamic Route</Link>
      <Link href="/gallery/photo/some-slug">Dynamic Route</Link>
      <Link href="/_shop/">Optional Catchall Route</Link>
      <Link href="/docs/some/thing">Catchall Route</Link>
      <Link href="/api-legacy/v1/testing">Rewrite Route</Link>
      <Link href="/blog/category/testing">Redirect Route</Link>
    </div>
  )
}
`
      )

      const { exitCode } = await next.build()
      expect(exitCode).toBe(0)
    })

    it('should work with Route type casting', async () => {
      await next.stop()
      await next.patchFile(
        'app/route-casting.tsx',
        `
import type { Route } from 'next'
import Link from 'next/link'

export default function RouteCasting() {
  const dynamicPath = '/dynamic-path'
  
  return (
    <Link href={dynamicPath as Route}>Casted Route</Link>
  )
}
`
      )

      const { exitCode } = await next.build()
      expect(exitCode).toBe(0)
    })

    it('should fail type checking with invalid routes', async () => {
      await next.stop()
      await next.patchFile(
        'app/invalid-links.tsx',
        `
import Link from 'next/link'

export default function InvalidLinks() {
  return (
    <div>
      <Link href="/invalid-route">Invalid</Link>
    </div>
  )
}
`
      )

      const { exitCode, cliOutput } = await next.build()
      // clean up for future tests
      await next.deleteFile('app/invalid-links.tsx')

      expect(exitCode).toBe(1)
      expect(cliOutput).toContain(
        `Type error: "/invalid-route" is not an existing route. If it is intentional, please type it explicitly with \`as Route\`.`
      )
    })

    it('should pass type checking with valid redirect routes', async () => {
      await next.stop()
      await next.patchFile(
        'app/valid-redirects.tsx',
        `
import { redirect, permanentRedirect } from 'next/navigation'

export default function ValidRedirects() {
  function handleRedirect() {
    redirect('/dashboard')
    permanentRedirect('/project/123')
  }

  return (
    <button onClick={handleRedirect}>
      Test Redirects
    </button>
  )
}
`
      )

      const { exitCode } = await next.build()
      expect(exitCode).toBe(0)
    })

    it('should work with redirect Route type casting', async () => {
      await next.stop()
      await next.patchFile(
        'app/redirect-casting.tsx',
        `
import type { Route } from 'next'
import { redirect, permanentRedirect } from 'next/navigation'

export default function RedirectCasting() {
  function handleRedirect() {
    const dynamicPath = '/dynamic-path'
    redirect(dynamicPath as Route)
    permanentRedirect(dynamicPath as Route)
  }

  return (
    <button onClick={handleRedirect}>
      Casted Redirects
    </button>
  )
}
`
      )

      const { exitCode } = await next.build()
      expect(exitCode).toBe(0)
    })

    it('should fail type checking with invalid redirect routes', async () => {
      await next.stop()
      await next.patchFile(
        'app/invalid-redirects.tsx',
        `
import { redirect, permanentRedirect } from 'next/navigation'

export default function InvalidRedirects() {
  function handleRedirect() {
    redirect('/invalid-route')
    permanentRedirect('/another-invalid-route')
  }

  return (
    <button onClick={handleRedirect}>
      Invalid Redirects
    </button>
  )
}
`
      )

      const { exitCode, cliOutput } = await next.build()
      // clean up for future tests
      await next.deleteFile('app/invalid-redirects.tsx')

      expect(exitCode).toBe(1)
      expect(cliOutput).toContain(
        `Type error: Argument of type '"/invalid-route"' is not assignable to parameter of type 'RouteImpl<"/invalid-route">'.`
      )
      expect(cliOutput).toContain(
        `Type error: Argument of type '"/another-invalid-route"' is not assignable to parameter of type 'RouteImpl<"/another-invalid-route">'.`
      )
    })
  }
})
