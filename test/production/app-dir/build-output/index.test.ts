import { nextTestSetup } from 'e2e-utils'
import stripAnsi from 'strip-ansi'
import { outdent } from 'outdent'

describe('production - app dir - build output', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  let output = ''
  beforeAll(() => {
    output = stripAnsi(next.cliOutput)
  })

  it('should only log app routes', async () => {
    expect(output).toContain('Route (app)')
    expect(output).not.toContain('Route (pages)')
    expect(output).not.toContain('/favicon.ico')
  })

  it('should always log version first then the rest jobs', async () => {
    const indexOfVersion = output.indexOf('▲ Next.js')
    const indexOfStartCompiling = output.indexOf(
      'Creating an optimized production build'
    )
    const indexOfLinting = output.indexOf(
      'Linting and checking validity of types'
    )
    expect(indexOfVersion).toBeLessThan(indexOfLinting)
    expect(indexOfStartCompiling).toBeLessThan(indexOfLinting)
  })

  it('should match the expected output format', async () => {
    expect(output).toContain('Size')
    expect(output).toContain('First Load JS')
    expect(output).toContain('+ First Load JS shared by all')
    expect(output).toContain('└ other shared chunks (total)')

    // output type
    expect(output).toContain('○  (Static)  prerendered as static content')
  })

  it('should log errors not caught by the worker without terminating the process', async () => {
    expect(output).toContain('Error: Boom')
    expect(output).not.toContain('Next.js build worker exited with code: 78')

    const $ = await next.render$('/uncaught-error')
    expect($('#sentinel').text()).toEqual('at buildtime')
  })

  it('should fail the build if you use a dynamic API outside of a render context - cookies', async () => {
    await next.stop()
    await next.patchFile(
      'app/out-of-band-dynamic-api/page.tsx',
      outdent`
        import { cookies } from 'next/headers'
        
        export default async function Page() {
          setTimeout(() => {
            cookies();
          }, 0)
          return <div>Hello World</div>
        }          
        `
    )
    const { cliOutput } = await next.build()
    await next.deleteFile('app/out-of-band-dynamic-api/page.tsx')

    expect(cliOutput).toContain('Next.js build worker exited with code: 78')
  })

  it('should fail the build if you use a dynamic API outside of a render context - headers', async () => {
    await next.stop()
    await next.patchFile(
      'app/out-of-band-dynamic-api/page.tsx',
      outdent`
        import { headers } from 'next/headers'
        
        export default async function Page({ searchParams }) {
          setTimeout(() => {
            headers()
          }, 0)
          return <div>Hello World</div>
        }          
        `
    )
    const { cliOutput } = await next.build()
    await next.deleteFile('app/out-of-band-dynamic-api/page.tsx')

    expect(cliOutput).toContain('Next.js build worker exited with code: 78')
  })

  it('should fail the build if you use a dynamic API outside of a render context - searchParams', async () => {
    await next.stop()
    await next.patchFile(
      'app/out-of-band-dynamic-api/page.tsx',
      outdent`
        export default async function Page({ searchParams }) {
          setTimeout(() => {
            searchParams.foo
          }, 0)
          return <div>Hello World</div>
        }          
        `
    )
    const { cliOutput } = await next.build()
    await next.deleteFile('app/out-of-band-dynamic-api/page.tsx')

    expect(cliOutput).toContain('Next.js build worker exited with code: 78')
  })

  it('should fail the build if you use a dynamic API outside of a render context - redirect', async () => {
    await next.stop()
    await next.patchFile(
      'app/out-of-band-dynamic-api/page.tsx',
      outdent`
        import { redirect } from 'next/navigation'
        
        export default async function Page({ searchParams }) {
          setTimeout(() => {
            redirect('/whatever')
          }, 0)
          return <div>Hello World</div>
        }          
        `
    )
    const { cliOutput } = await next.build()
    await next.deleteFile('app/out-of-band-dynamic-api/page.tsx')

    expect(cliOutput).toContain('Next.js build worker exited with code: 78')
  })

  it('should fail the build if you use a dynamic API outside of a render context - notFound', async () => {
    await next.stop()
    await next.patchFile(
      'app/out-of-band-dynamic-api/page.tsx',
      outdent`
        import { notFound } from 'next/navigation'
        
        export default async function Page({ searchParams }) {
          setTimeout(() => {
            notFound()
          }, 0)
          return <div>Hello World</div>
        }          
        `
    )
    const { cliOutput } = await next.build()
    await next.deleteFile('app/out-of-band-dynamic-api/page.tsx')

    expect(cliOutput).toContain('Next.js build worker exited with code: 78')
  })
})
