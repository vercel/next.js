import { FileRef, nextTestSetup } from 'e2e-utils'
import { createSandbox } from 'development-sandbox'
import path from 'path'
import { outdent } from 'outdent'

const middlewarePath = 'middleware.js'
const middlewareWarning = `A middleware can not alter response's body`

describe('middlewares', () => {
  const { next } = nextTestSetup({
    files: new FileRef(
      path.join(__dirname, '..', 'acceptance', 'fixtures', 'default-template')
    ),
    skipStart: true,
  })

  it.each([
    {
      title: 'returning response with literal string',
      code: outdent`
        export default function middleware() {
          return new Response('this is not allowed');
        }
      `,
    },
    {
      title: 'returning response with literal number',
      code: outdent`
        export default function middleware() {
          return new Response(10);
        }
      `,
    },
    {
      title: 'returning response with JSON.stringify',
      code: outdent`
        export default function middleware() {
          return new Response(JSON.stringify({ foo: 'this is not allowed' }));
        }
      `,
    },
    {
      title: 'populating response with a value',
      code: outdent`
        export default function middleware(request) {
          const body = JSON.stringify({ foo: 'this should not be allowed, but hard to detect with AST' })
          return new Response(body);
        }
      `,
    },
    {
      title: 'populating response with a function call',
      code: outdent`
        function buildBody() {
          return 'this should not be allowed, but hard to detect with AST'
        }
        export default function middleware(request) {
          return new Response(buildBody());
        }
      `,
    },
    {
      title: 'populating response with an async function call',
      code: outdent`
        export default async function middleware(request) {
          return new Response(await fetch('https://example.vercel.sh'));
        }
      `,
    },
  ])('does not warn when $title', async ({ code }) => {
    await using _sandbox = await createSandbox(
      next,
      new Map([[middlewarePath, code]])
    )
    expect(next.cliOutput).not.toMatch(middlewareWarning)
  })

  it.each([
    {
      title: 'returning null reponse body',
      code: outdent`
        export default function middleware() {
          return new Response(null);
        }
      `,
    },
    {
      title: 'returning undefined response body',
      code: outdent`
        export default function middleware() {
          return new Response(undefined);
        }
      `,
    },
  ])('does not warn when $title', async ({ code }) => {
    await using _sandbox = await createSandbox(
      next,
      new Map([[middlewarePath, code]])
    )
    expect(next.cliOutput).not.toMatch(middlewareWarning)
  })
})
