import { createSandbox } from 'development-sandbox'
import { FileRef, nextTestSetup } from 'e2e-utils'
import path from 'path'
import { outdent } from 'outdent'

// TODO: re-enable these tests after figuring out what is causing
// them to be so unreliable in CI
describe.skip('ReactRefreshLogBox app', () => {
  const { next } = nextTestSetup({
    files: new FileRef(path.join(__dirname, 'fixtures', 'default-template')),
    skipStart: true,
  })

  test('<Link> with multiple children', async () => {
    await using sandbox = await createSandbox(next)
    const { session } = sandbox

    await session.patch(
      'index.js',
      outdent`
        import Link from 'next/link'

        export default function Index() {
          return (
            <Link href="/">
              <p>One</p>
              <p>Two</p>
            </Link>
          )
        }
      `
    )

    await session.assertHasRedbox()
    expect(await session.getRedboxDescription()).toMatchInlineSnapshot(
      `"Error: Multiple children were passed to <Link> with \`href\` of \`/\` but only one child is supported https://nextjs.org/docs/messages/link-multiple-children"`
    )
    expect(
      await session.evaluate(
        () =>
          (
            document
              .querySelector('body > nextjs-portal')
              .shadowRoot.querySelector(
                '#nextjs__container_errors_desc a:nth-of-type(1)'
              ) as any
          ).href
      )
    ).toMatch('https://nextjs.org/docs/messages/link-multiple-children')
  })

  test('<Link> component props errors', async () => {
    await using sandbox = await createSandbox(next)
    const { session } = sandbox

    await session.patch(
      'index.js',
      outdent`
        import Link from 'next/link'

        export default function Hello() {
          return <Link />
        }
      `
    )

    await session.assertHasRedbox()
    expect(await session.getRedboxDescription()).toMatchInlineSnapshot(
      `"Error: Failed prop type: The prop \`href\` expects a \`string\` or \`object\` in \`<Link>\`, but got \`undefined\` instead."`
    )

    await session.patch(
      'index.js',
      outdent`
        import Link from 'next/link'

        export default function Hello() {
          return <Link href="/">Abc</Link>
        }
      `
    )
    await session.assertNoRedbox()

    await session.patch(
      'index.js',
      outdent`
        import Link from 'next/link'

        export default function Hello() {
          return (
            <Link
              href="/"
              as="/"
              replace={false}
              scroll={false}
              shallow={false}
              passHref={false}
              prefetch={false}
            >
              Abc
            </Link>
          )
        }
      `
    )
    await session.assertNoRedbox()

    await session.patch(
      'index.js',
      outdent`
        import Link from 'next/link'

        export default function Hello() {
          return (
            <Link
              href="/"
              as="/"
              replace={true}
              scroll={true}
              shallow={true}
              passHref={true}
              prefetch={true}
            >
              Abc
            </Link>
          )
        }
      `
    )
    await session.assertNoRedbox()

    await session.patch(
      'index.js',
      outdent`
        import Link from 'next/link'

        export default function Hello() {
          return (
            <Link
              href="/"
              as="/"
              replace={undefined}
              scroll={undefined}
              shallow={undefined}
              passHref={undefined}
              prefetch={undefined}
            >
              Abc
            </Link>
          )
        }
      `
    )
    await session.assertNoRedbox()

    await session.patch(
      'index.js',
      outdent`
        import Link from 'next/link'

        export default function Hello() {
          return (
            <Link
              href="/"
              as="/"
              replace={undefined}
              scroll={'oops'}
              shallow={undefined}
              passHref={undefined}
              prefetch={undefined}
            >
              Abc
            </Link>
          )
        }
      `
    )
    await session.assertHasRedbox()
    expect(await session.getRedboxDescription()).toMatchSnapshot()

    await session.patch(
      'index.js',
      outdent`
        import Link from 'next/link'

        export default function Hello() {
          return (
            <Link
              href={false}
              as="/"
              replace={undefined}
              scroll={'oops'}
              shallow={undefined}
              passHref={undefined}
              prefetch={undefined}
            >
              Abc
            </Link>
          )
        }
      `
    )
    await session.assertHasRedbox()
    expect(await session.getRedboxDescription()).toMatchSnapshot()
  })

  test('server-side only compilation errors', async () => {
    await using sandbox = await createSandbox(next)
    const { session } = sandbox

    await session.patch(
      'app/page.js',
      outdent`
        'use client'
        import myLibrary from 'my-non-existent-library'
        export async function getStaticProps() {
          return {
            props: {
              result: myLibrary()
            }
          }
        }
        export default function Hello(props) {
          return <h1>{props.result}</h1>
        }
      `
    )

    await session.assertHasRedbox()
  })
})
