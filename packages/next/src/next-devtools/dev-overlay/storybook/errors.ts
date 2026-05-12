import type { SupportedErrorEvent } from '../container/runtime-error/render-error'
import type { ReadyRuntimeError } from '../utils/get-error-by-type'
import { lorem } from '../utils/lorem'

const originalCodeFrame = (message: string) => {
  return `\u001b[0m \u001b[90m 1 \u001b[39m \u001b[36mexport\u001b[39m \u001b[36mdefault\u001b[39m \u001b[36mfunction\u001b[39m \u001b[33mHome\u001b[39m() {\u001b[0m
\u001b[0m\u001b[31m\u001b[1m>\u001b[22m\u001b[39m\u001b[90m 2 \u001b[39m   \u001b[36mthrow\u001b[39m \u001b[36mnew\u001b[39m \u001b[33mError\u001b[39m(\u001b[32m'${message}'\u001b[39m)\u001b[0m
\u001b[0m \u001b[90m   \u001b[39m         \u001b[31m\u001b[1m^\u001b[22m\u001b[39m\u001b[0m
\u001b[0m \u001b[90m 3 \u001b[39m   \u001b[36mreturn\u001b[39m \u001b[33m<\u001b[39m\u001b[33mdiv\u001b[39m\u001b[33m>\u001b[39m\u001b[33mWelcome to my Next.js application! This is a longer piece of text that will demonstrate text wrapping behavior in the code frame.\u001b[39m\u001b[33m<\u001b[39m\u001b[33m/\u001b[39m\u001b[33mdiv\u001b[39m\u001b[33m>\u001b[39m\u001b[0m
\u001b[0m \u001b[90m 4 \u001b[39m }\u001b[0m
\u001b[0m \u001b[90m 5 \u001b[39m\u001b[0m`
}

const instantCodeFrame = ({
  beforeLine,
  line,
  markerLine,
  pointerColumn,
  afterLine = 'return <div>Hello</div>',
}: {
  beforeLine: string
  line: string
  markerLine: number
  pointerColumn: number
  afterLine?: string
}) => {
  const markerPadding = ' '.repeat(Math.max(pointerColumn - 1, 0))

  return `\u001b[0m \u001b[90m 1 \u001b[39m ${beforeLine}\u001b[0m
\u001b[0m \u001b[90m ${markerLine - 1} \u001b[39m \u001b[36mexport\u001b[39m \u001b[36mdefault\u001b[39m \u001b[36masync\u001b[39m \u001b[36mfunction\u001b[39m \u001b[33mPage\u001b[39m() {\u001b[0m
\u001b[0m\u001b[31m\u001b[1m>\u001b[22m\u001b[39m\u001b[90m ${markerLine} \u001b[39m   ${line}\u001b[0m
\u001b[0m \u001b[90m   \u001b[39m   ${markerPadding}\u001b[31m\u001b[1m^\u001b[22m\u001b[39m\u001b[0m
\u001b[0m \u001b[90m ${markerLine + 1} \u001b[39m   ${afterLine}\u001b[0m
\u001b[0m \u001b[90m ${markerLine + 2} \u001b[39m }\u001b[0m`
}

const sourceStackFrame = {
  file: 'app/page.tsx',
  methodName: 'Home',
  arguments: [],
  line1: 2,
  column1: 9,
}

const originalStackFrame = {
  file: 'app/page.tsx',
  methodName: 'Home',
  arguments: [],
  line1: 2,
  column1: 9,
  ignored: false,
}

const frame = {
  originalStackFrame: {
    file: './app/page.tsx',
    methodName: 'MyComponent',
    arguments: [],
    line1: 10,
    column1: 5,
    ignored: false,
  },
  sourceStackFrame: {
    file: './app/page.tsx',
    methodName: 'MyComponent',
    arguments: [],
    line1: 10,
    column1: 5,
  },
  originalCodeFrame: 'export default function MyComponent() {',
  error: false,
  reason: null,
  external: false,
  ignored: false,
}

const ignoredFrame = {
  ...frame,
  ignored: true,
}

function createStoryFrames({
  reason,
  file,
  methodName,
  line,
  column,
  codeFrame,
}: {
  reason: string
  file: string
  methodName: string
  line: number
  column: number
  codeFrame: string
}) {
  return () =>
    Promise.resolve([
      {
        error: true,
        reason,
        external: false,
        ignored: false,
        sourceStackFrame: {
          file,
          methodName,
          arguments: [],
          line1: line,
          column1: column,
        },
        originalStackFrame: {
          file,
          methodName,
          arguments: [],
          line1: line,
          column1: column,
          ignored: false,
        },
        originalCodeFrame: codeFrame,
      },
    ])
}

export const errors: SupportedErrorEvent[] = [
  {
    id: 1,
    error: Object.assign(new Error('First error message'), {
      __NEXT_ERROR_CODE: 'E001',
    }),
    frames: [
      {
        file: 'app/page.tsx',
        methodName: 'Home',
        arguments: [],
        line1: 10,
        column1: 5,
      },
    ],
    type: 'runtime',
  },
  {
    id: 2,
    error: Object.assign(new Error('Second error message'), {
      __NEXT_ERROR_CODE: 'E002',
    }),
    frames: [],
    type: 'runtime',
  },
  {
    id: 3,
    error: Object.assign(new Error('Third error message'), {
      __NEXT_ERROR_CODE: 'E003',
    }),
    frames: [],
    type: 'runtime',
  },
]

export const runtimeErrors: ReadyRuntimeError[] = [
  {
    id: 1,
    runtime: true,
    error: new Error(lorem),
    frames: () =>
      Promise.resolve([
        frame,
        {
          ...frame,
          originalStackFrame: {
            ...frame.originalStackFrame,
            methodName: 'ParentComponent',
            lineNumber: 5,
          },
        },
        {
          ...frame,
          originalStackFrame: {
            ...frame.originalStackFrame,
            methodName: 'GrandparentComponent',
            lineNumber: 1,
          },
        },
        ...Array(20).fill(ignoredFrame),
      ]),
    type: 'runtime',
  },
  {
    id: 2,
    runtime: true,
    error: new Error('Second error message'),
    frames: () =>
      Promise.resolve([
        {
          error: true,
          reason: 'Second error message',
          external: false,
          ignored: false,
          sourceStackFrame,
          originalStackFrame,
          originalCodeFrame: originalCodeFrame('Second error message'),
        },
      ]),
    type: 'console',
  },
  {
    id: 3,
    runtime: true,
    error: new Error('Third error message'),
    frames: () =>
      Promise.resolve([
        {
          error: true,
          reason: 'Third error message',
          external: false,
          ignored: false,
          sourceStackFrame,
          originalStackFrame,
          originalCodeFrame: originalCodeFrame('Third error message'),
        },
      ]),
    type: 'recoverable',
  },
  {
    id: 4,
    runtime: true,
    error: new Error('typeof window !== undefined'),
    frames: () =>
      Promise.resolve([
        {
          error: true,
          reason: 'typeof window !== undefined',
          external: false,
          ignored: false,
          sourceStackFrame,
          originalStackFrame,
          originalCodeFrame: originalCodeFrame('typeof window !== undefined'),
        },
      ]),
    type: 'runtime',
  },
  {
    id: 5,
    runtime: true,
    error: new Error('Very long stack frame file name.'),
    frames: () =>
      Promise.resolve([
        {
          error: true,
          reason: 'Fifth error message',
          external: false,
          ignored: false,
          sourceStackFrame: {
            ...sourceStackFrame,
            file: 'foo/bar/baz/qux/quux/quuz/corge/grault/garply/waldo/fred/plugh/xyzzy/thud.tsx',
          },
          originalStackFrame: {
            ...originalStackFrame,
            file: 'foo/bar/baz/qux/quux/quuz/corge/grault/garply/waldo/fred/plugh/xyzzy/thud.tsx (0:0)',
          },
          originalCodeFrame: originalCodeFrame('Fifth error message'),
        },
      ]),
    type: 'console',
  },
  {
    id: 6,
    runtime: true,
    error: new Error('Sixth error message'),
    frames: () =>
      Promise.resolve([
        {
          error: true,
          reason: 'Sixth error message',
          external: false,
          ignored: false,
          sourceStackFrame,
          originalStackFrame,
          originalCodeFrame: originalCodeFrame('Sixth error message'),
        },
      ]),
    type: 'recoverable',
  },
  {
    id: 7,
    runtime: true,
    error: new Error('Seventh error message'),
    frames: () =>
      Promise.resolve([
        {
          error: true,
          reason: 'Sixth error message',
          external: false,
          ignored: false,
          sourceStackFrame,
          originalStackFrame,
          originalCodeFrame: originalCodeFrame('Sixth error message'),
        },
      ]),
    type: 'runtime',
  },
  {
    id: 8,
    runtime: true,
    error: new Error('Eighth error message'),
    frames: () =>
      Promise.resolve([
        {
          error: true,
          reason: 'Eighth error message',
          external: false,
          ignored: false,
          sourceStackFrame,
          originalStackFrame,
          originalCodeFrame: originalCodeFrame('Eighth error message'),
        },
      ]),
    type: 'runtime',
  },
  {
    id: 9,
    runtime: true,
    error: new Error('Ninth error message'),
    frames: () =>
      Promise.resolve([
        {
          error: true,
          reason: 'Ninth error message',
          external: false,
          ignored: false,
          sourceStackFrame,
          originalStackFrame,
          originalCodeFrame: originalCodeFrame('Ninth error message'),
        },
      ]),
    type: 'runtime',
  },
  {
    id: 10,
    runtime: true,
    error: new Error('Tenth error message'),
    frames: () =>
      Promise.resolve([
        {
          error: true,
          reason: 'Tenth error message',
          external: false,
          ignored: false,
          sourceStackFrame,
          originalStackFrame,
          originalCodeFrame: originalCodeFrame('Tenth error message'),
        },
      ]),
    type: 'runtime',
  },
]

export const instantRuntimeDataErrors: ReadyRuntimeError[] = [
  {
    id: 101,
    runtime: true,
    error: Object.assign(
      new Error(
        'Route "/instant/runtime-data": Next.js encountered runtime data during the initial render.\n\n`cookies()`, `headers()`, `params`, or `searchParams` accessed outside of `<Suspense>` blocks navigation, leading to a slower user experience.\n\nWays to fix this:\n  - Move the data access into a child component within a <Suspense> boundary\n  - Use `generateStaticParams` to make route params static\n  - Set `export const instant = false` to allow a blocking route\n\nLearn more: https://nextjs.org/docs/messages/blocking-route'
      ),
      { __NEXT_ERROR_CODE: 'E1166' }
    ),
    frames: createStoryFrames({
      reason:
        'Route "/instant/runtime-data": Next.js encountered runtime data during the initial render.',
      file: 'app/instant/runtime-data/page.tsx',
      methodName: 'Page',
      line: 6,
      column: 16,
      codeFrame: instantCodeFrame({
        beforeLine: "import { cookies } from 'next/headers'",
        line: 'await cookies()',
        markerLine: 6,
        pointerColumn: 14,
      }),
    }),
    type: 'runtime',
  },
]

export const instantUncachedDataErrors: ReadyRuntimeError[] = [
  {
    id: 102,
    runtime: true,
    error: Object.assign(
      new Error(
        'Route "/instant/uncached-data": Next.js encountered uncached data during the initial render.\n\n`fetch(...)` or `connection()` accessed outside of `<Suspense>` blocks navigation, leading to a slower user experience.\n\nWays to fix this:\n  - Cache the data access with `"use cache"`\n  - Move the data access into a child component within a <Suspense> boundary\n  - Set `export const instant = false` to allow a blocking route\n\nLearn more: https://nextjs.org/docs/messages/blocking-route'
      ),
      { __NEXT_ERROR_CODE: 'E1164' }
    ),
    frames: createStoryFrames({
      reason:
        'Route "/instant/uncached-data": Next.js encountered uncached data during the initial render.',
      file: 'app/instant/uncached-data/page.tsx',
      methodName: 'Page',
      line: 7,
      column: 22,
      codeFrame: instantCodeFrame({
        beforeLine: "import { connection } from 'next/server'",
        line: 'await fetch("https://example.com/api/data")',
        markerLine: 7,
        pointerColumn: 20,
      }),
    }),
    type: 'runtime',
  },
]

export const instantViewportErrors: ReadyRuntimeError[] = [
  {
    id: 103,
    runtime: true,
    error: Object.assign(
      new Error(
        'Route "/instant/runtime-viewport": Next.js encountered runtime data such as `cookies()`, `headers()`, `params`, or `searchParams` inside `generateViewport`. This delays the entire page from rendering, resulting in a slow user experience. Learn more: https://nextjs.org/docs/messages/next-prerender-dynamic-viewport'
      ),
      { __NEXT_ERROR_CODE: 'E1165' }
    ),
    frames: createStoryFrames({
      reason:
        'Route "/instant/runtime-viewport": Next.js encountered runtime data such as `cookies()`, `headers()`, `params`, or `searchParams` inside `generateViewport`.',
      file: 'app/instant/runtime-viewport/page.tsx',
      methodName: 'generateViewport',
      line: 4,
      column: 16,
      codeFrame: instantCodeFrame({
        beforeLine: "import { cookies } from 'next/headers'",
        line: 'await cookies()',
        markerLine: 4,
        pointerColumn: 14,
        afterLine: 'return { themeColor: "black" }',
      }),
    }),
    type: 'runtime',
  },
]

export const instantViewportUncachedErrors: ReadyRuntimeError[] = [
  {
    id: 107,
    runtime: true,
    error: Object.assign(
      new Error(
        'Route "/instant/uncached-viewport": Next.js encountered uncached data inside `generateViewport()`. This prevents the page from being prerendered, leading to a slower user experience. Learn more: https://nextjs.org/docs/messages/next-prerender-dynamic-viewport'
      ),
      { __NEXT_ERROR_CODE: 'E1165' }
    ),
    frames: createStoryFrames({
      reason:
        'Route "/instant/uncached-viewport": Next.js encountered uncached data inside `generateViewport()`.',
      file: 'app/instant/uncached-viewport/page.tsx',
      methodName: 'generateViewport',
      line: 4,
      column: 20,
      codeFrame: instantCodeFrame({
        beforeLine: "import { connection } from 'next/server'",
        line: 'await fetch("https://example.com/theme")',
        markerLine: 4,
        pointerColumn: 18,
        afterLine: 'return { themeColor: "#000" }',
      }),
    }),
    type: 'runtime',
  },
]

export const instantMetadataErrors: ReadyRuntimeError[] = [
  {
    id: 104,
    runtime: true,
    error: Object.assign(
      new Error(
        'Route "/instant/runtime-metadata": Next.js encountered runtime data such as `cookies()`, `headers()`, `params`, or `searchParams` inside `generateMetadata`, or you have file-based metadata such as icons that depend on dynamic params segments. Except for this instance, the page would have been entirely prerenderable which may have been the intended behavior. See more info here: https://nextjs.org/docs/messages/next-prerender-dynamic-metadata'
      ),
      { __NEXT_ERROR_CODE: 'E1168' }
    ),
    frames: createStoryFrames({
      reason:
        'Route "/instant/runtime-metadata": Next.js encountered runtime data such as `cookies()`, `headers()`, `params`, or `searchParams` inside `generateMetadata`.',
      file: 'app/instant/runtime-metadata/page.tsx',
      methodName: 'generateMetadata',
      line: 5,
      column: 16,
      codeFrame: instantCodeFrame({
        beforeLine: "import { cookies } from 'next/headers'",
        line: 'await cookies()',
        markerLine: 5,
        pointerColumn: 14,
        afterLine: 'return { title: "Hello" }',
      }),
    }),
    type: 'runtime',
  },
]

export const instantMetadataUncachedErrors: ReadyRuntimeError[] = [
  {
    id: 108,
    runtime: true,
    error: Object.assign(
      new Error(
        'Route "/instant/uncached-metadata": Next.js encountered uncached data inside `generateMetadata()`. This prevents the page from being prerendered, leading to a slower user experience. Learn more: https://nextjs.org/docs/messages/next-prerender-dynamic-metadata'
      ),
      { __NEXT_ERROR_CODE: 'E1168' }
    ),
    frames: createStoryFrames({
      reason:
        'Route "/instant/uncached-metadata": Next.js encountered uncached data inside `generateMetadata()`.',
      file: 'app/instant/uncached-metadata/page.tsx',
      methodName: 'generateMetadata',
      line: 5,
      column: 20,
      codeFrame: instantCodeFrame({
        beforeLine: "import { connection } from 'next/server'",
        line: 'await fetch("https://example.com/meta")',
        markerLine: 5,
        pointerColumn: 18,
        afterLine: 'return { title: "Hello" }',
      }),
    }),
    type: 'runtime',
  },
]

export const instantCurrentTimeErrors: ReadyRuntimeError[] = [
  {
    id: 105,
    runtime: true,
    error: Object.assign(
      new Error(
        'Route "/instant/current-time" used `Date.now()` before accessing either uncached data (e.g. `fetch()`) or awaiting `connection()`. When configured for Runtime prefetching, accessing the current time in a Server Component requires reading one of these data sources first. Alternatively, consider moving this expression into a Client Component or Cache Component. See more info here: https://nextjs.org/docs/messages/next-prerender-runtime-current-time'
      ),
      { __NEXT_ERROR_CODE: 'E1078' }
    ),
    frames: createStoryFrames({
      reason:
        'Route "/instant/current-time" used `Date.now()` before accessing either uncached data or awaiting `connection()`.',
      file: 'app/instant/current-time/page.tsx',
      methodName: 'Page',
      line: 4,
      column: 20,
      codeFrame: instantCodeFrame({
        beforeLine: "import { connection } from 'next/server'",
        line: 'const now = Date.now()',
        markerLine: 4,
        pointerColumn: 18,
        afterLine: 'await connection()',
      }),
    }),
    type: 'runtime',
  },
]

export const instantMathRandomErrors: ReadyRuntimeError[] = [
  {
    id: 109,
    runtime: true,
    error: Object.assign(
      new Error(
        'Route "/instant/random" used `Math.random()` before accessing either uncached data (e.g. `fetch()`) or awaiting `connection()`. When configured for Runtime prefetching, accessing random values in a Server Component requires reading one of these data sources first. Alternatively, consider moving this expression into a Client Component or Cache Component. See more info here: https://nextjs.org/docs/messages/next-prerender-runtime-random'
      ),
      { __NEXT_ERROR_CODE: 'E1077' }
    ),
    frames: createStoryFrames({
      reason:
        'Route "/instant/random" used `Math.random()` before accessing either uncached data or awaiting `connection()`.',
      file: 'app/instant/random/page.tsx',
      methodName: 'Page',
      line: 4,
      column: 22,
      codeFrame: instantCodeFrame({
        beforeLine: "import { connection } from 'next/server'",
        line: 'const id = Math.random()',
        markerLine: 4,
        pointerColumn: 20,
        afterLine: 'await connection()',
      }),
    }),
    type: 'runtime',
  },
]

export const instantCryptoRandomUUIDErrors: ReadyRuntimeError[] = [
  {
    id: 110,
    runtime: true,
    error: Object.assign(
      new Error(
        'Route "/instant/crypto" used `crypto.randomUUID()` before accessing either uncached data (e.g. `fetch()`) or awaiting `connection()`. When configured for Runtime prefetching, accessing cryptographic randomness in a Server Component requires reading one of these data sources first. Alternatively, consider moving this expression into a Client Component or Cache Component. See more info here: https://nextjs.org/docs/messages/next-prerender-runtime-crypto'
      ),
      { __NEXT_ERROR_CODE: 'E1079' }
    ),
    frames: createStoryFrames({
      reason:
        'Route "/instant/crypto" used `crypto.randomUUID()` before accessing either uncached data or awaiting `connection()`.',
      file: 'app/instant/crypto/page.tsx',
      methodName: 'Page',
      line: 4,
      column: 28,
      codeFrame: instantCodeFrame({
        beforeLine: "import { connection } from 'next/server'",
        line: 'const id = crypto.randomUUID()',
        markerLine: 4,
        pointerColumn: 26,
        afterLine: 'await connection()',
      }),
    }),
    type: 'runtime',
  },
]

export const instantClientMathRandomErrors: ReadyRuntimeError[] = [
  {
    id: 111,
    runtime: true,
    error: Object.assign(
      new Error(
        'Route "/instant/client-random": Next.js encountered `Math.random()` inside a Client Component without a Suspense boundary. Without an upstream `<Suspense>` boundary, Next.js has no fallback to prerender in place of this Client Component. Learn more: https://nextjs.org/docs/messages/next-prerender-random-client'
      ),
      { __NEXT_ERROR_CODE: 'E1180' }
    ),
    frames: createStoryFrames({
      reason:
        'Route "/instant/client-random": Next.js encountered `Math.random()` inside a Client Component without a Suspense boundary.',
      file: 'app/instant/client-random/random-widget.tsx',
      methodName: 'RandomWidget',
      line: 4,
      column: 22,
      codeFrame: instantCodeFrame({
        beforeLine: "'use client'",
        line: 'const value = Math.random()',
        markerLine: 4,
        pointerColumn: 20,
        afterLine: 'return <div>{value}</div>',
      }),
    }),
    type: 'runtime',
  },
]

export const instantValidationBlockedErrors: ReadyRuntimeError[] = [
  {
    id: 106,
    runtime: true,
    error: Object.assign(
      new Error(
        'Route "/instant/client-parent": Could not validate `unstable_instant` because a Client Component in a parent segment prevented the page from rendering.'
      ),
      { __NEXT_ERROR_CODE: 'E1082' }
    ),
    frames: createStoryFrames({
      reason:
        'Route "/instant/client-parent": Could not validate `unstable_instant` because a Client Component in a parent segment prevented the page from rendering.',
      file: 'app/instant/client-parent/page.tsx',
      methodName: 'Page',
      line: 3,
      column: 1,
      codeFrame: instantCodeFrame({
        beforeLine: "import ClientShell from './client-shell'",
        line: "'use client'",
        markerLine: 3,
        pointerColumn: 1,
        afterLine: 'export const unstable_instant = true',
      }),
    }),
    type: 'runtime',
  },
]
