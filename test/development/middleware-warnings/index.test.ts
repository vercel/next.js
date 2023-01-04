import { createNext } from 'e2e-utils'
import { NextInstance } from 'test/lib/next-modes/base'
import { sandbox } from '../acceptance/helpers'

const middlewarePath = 'middleware.js'
const middlewareWarning = `A middleware can not alter response's body`

describe('middlewares', () => {
  let next: NextInstance
  let cleanup

  beforeAll(async () => {
    next = await createNext({
      files: {},
      skipStart: true,
    })
  })

  afterAll(() => next.destroy())

  afterEach(() => cleanup?.())

  it.each([
    {
      title: 'returning response with literal string',
      code: `export default function middleware() {
              return new Response('this is not allowed');
            }`,
    },
    {
      title: 'returning response with literal number',
      code: `export default function middleware() {
              return new Response(10);
            }`,
    },
    {
      title: 'returning response with JSON.stringify',
      code: `export default function middleware() {
              return new Response(JSON.stringify({ foo: 'this is not allowed' }));
            }`,
    },
    {
      title: 'populating response with a value',
      code: `export default function middleware(request) {
              const body = JSON.stringify({ foo: 'this should not be allowed, but hard to detect with AST' })
              return new Response(body);
            }`,
    },
    {
      title: 'populating response with a function call',
      code: `function buildBody() {
              return 'this should not be allowed, but hard to detect with AST'
            }
            export default function middleware(request) {
              return new Response(buildBody());
            }`,
    },
    {
      title: 'populating response with an async function call',
      code: `export default async function middleware(request) {
              return new Response(await fetch('https://example.vercel.sh'));
            }`,
    },
  ])('does not warn when $title', async ({ code }) => {
    ;({ cleanup } = await sandbox(next, new Map([[middlewarePath, code]])))
    expect(next.cliOutput).not.toMatch(middlewareWarning)
  })

  it.each([
    {
      title: 'returning null reponse body',
      code: `export default function middleware() {
              return new Response(null);
            }`,
    },
    {
      title: 'returning undefined response body',
      code: `export default function middleware() {
              return new Response(undefined);
            }`,
    },
  ])('does not warn when $title', async ({ code }) => {
    ;({ cleanup } = await sandbox(next, new Map([[middlewarePath, code]])))
    expect(next.cliOutput).not.toMatch(middlewareWarning)
  })
})
