import type { SupportedErrorEvent } from '../../src/next-devtools/dev-overlay/container/runtime-error/render-error'
import type { ReadyRuntimeError } from '../../src/next-devtools/dev-overlay/utils/get-error-by-type'
import { lorem } from '../../src/next-devtools/dev-overlay/utils/lorem'

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
        error: true as const,
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
        'Route "/01-cookies-body": Next.js encountered runtime data during prerendering.\n\n`cookies()`, `headers()`, `params`, or `searchParams` accessed outside of `<Suspense>` prevents the route from being prerendered, blocking the page load and leading to a slower user experience.\n\nWays to fix this:\n  - [stream] Provide a placeholder with `<Suspense fallback={...}>` around the data access\n  - [cache] If the runtime data is `params` and they\'re known, prerender them with `generateStaticParams`\n  - [block] Set `export const instant = false` to allow a blocking route\n\nLearn more: https://nextjs.org/docs/messages/blocking-route'
      ),
      { __NEXT_ERROR_CODE: 'E1221' }
    ),
    frames: createStoryFrames({
      reason:
        'Route "/01-cookies-body": Next.js encountered runtime data during the initial render.',
      file: 'app/01-cookies-body/page.tsx',
      methodName: 'Page',
      line: 4,
      column: 13,
      codeFrame: instantCodeFrame({
        beforeLine: "import { cookies } from 'next/headers'",
        line: 'const c = await cookies()',
        markerLine: 4,
        pointerColumn: 11,
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
        'Route "/06-uncached-fetch-body": Next.js encountered uncached data during prerendering.\n\n`fetch(...)` or `connection()` accessed outside of `<Suspense>` prevents the route from being prerendered, blocking the page load and leading to a slower user experience.\n\nWays to fix this:\n  - [cache] Cache the data access with `"use cache"`\n  - [stream] Provide a placeholder with `<Suspense fallback={...}>` around the data access\n  - [block] Set `export const instant = false` to allow a blocking route\n\nLearn more: https://nextjs.org/docs/messages/blocking-route'
      ),
      { __NEXT_ERROR_CODE: 'E1220' }
    ),
    frames: createStoryFrames({
      reason:
        'Route "/06-uncached-fetch-body": Next.js encountered uncached data during the initial render.',
      file: 'app/06-uncached-fetch-body/page.tsx',
      methodName: 'Page',
      line: 6,
      column: 21,
      codeFrame: instantCodeFrame({
        beforeLine: 'export default async function Page() {',
        line: 'const res = await fetch("http://example.com", { cache: "no-store" })',
        markerLine: 6,
        pointerColumn: 21,
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
        'Route "/14-cookies-in-viewport": Next.js encountered runtime data in `generateViewport()`.\n\n`cookies()`, `headers()`, `params`, or `searchParams` in `generateViewport()` prevents the page from being prerendered, leading to a slower user experience.\n\nWays to fix this:\n  - [static] Use a static viewport export instead of `generateViewport()`\n  - [block] Set `export const instant = false` to allow a blocking route\n\nLearn more: https://nextjs.org/docs/messages/blocking-prerender-viewport-runtime'
      ),
      { __NEXT_ERROR_CODE: 'E1208' }
    ),
    frames: createStoryFrames({
      reason:
        'Route "/14-cookies-in-viewport": Next.js encountered runtime data in `generateViewport()`.',
      file: 'app/14-cookies-in-viewport/page.tsx',
      methodName: 'generateViewport',
      line: 5,
      column: 13,
      codeFrame: instantCodeFrame({
        beforeLine:
          'export async function generateViewport(): Promise<Viewport> {',
        line: 'const c = await cookies()',
        markerLine: 5,
        pointerColumn: 11,
        afterLine:
          'return { themeColor: c.getAll().length > 0 ? "#000" : "#fff" }',
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
        'Route "/15-fetch-in-viewport": Next.js encountered uncached data in `generateViewport()`.\n\n`fetch(...)` or `connection()` in `generateViewport()` prevents the page from being prerendered, leading to a slower user experience.\n\nWays to fix this:\n  - [cache] Cache the viewport data with `"use cache"` in `generateViewport()`\n  - [block] Set `export const instant = false` to allow a blocking route\n\nLearn more: https://nextjs.org/docs/messages/blocking-prerender-viewport-dynamic'
      ),
      { __NEXT_ERROR_CODE: 'E1210' }
    ),
    frames: createStoryFrames({
      reason:
        'Route "/15-fetch-in-viewport": Next.js encountered uncached data in `generateViewport()`.',
      file: 'app/15-fetch-in-viewport/page.tsx',
      methodName: 'generateViewport',
      line: 8,
      column: 21,
      codeFrame: instantCodeFrame({
        beforeLine:
          'export async function generateViewport(): Promise<Viewport> {',
        line: 'const res = await fetch("http://example.com", { cache: "no-store" })',
        markerLine: 8,
        pointerColumn: 21,
        afterLine: 'return { themeColor: res.ok ? "#000" : "#fff" }',
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
        'Route "/12-cookies-in-metadata": Next.js encountered runtime data in `generateMetadata()`.\n\nThis route\'s metadata is blocked, but the rest of its content can be prerendered. `cookies()`, `headers()`, `params`, or `searchParams` accessed in `generateMetadata()` cause it to run dynamically.\n\nWays to fix this:\n  - [static] Use a static metadata export instead of `generateMetadata()`\n  - [dynamic] Render a marker component that calls `await connection()` inside `<Suspense>` on the page\n\nLearn more: https://nextjs.org/docs/messages/blocking-prerender-metadata-runtime'
      ),
      { __NEXT_ERROR_CODE: 'E1230' }
    ),
    frames: createStoryFrames({
      reason:
        'Route "/12-cookies-in-metadata": Next.js encountered runtime data in `generateMetadata()`.',
      file: 'app/12-cookies-in-metadata/page.tsx',
      methodName: 'generateMetadata',
      line: 5,
      column: 13,
      codeFrame: instantCodeFrame({
        beforeLine:
          'export async function generateMetadata(): Promise<Metadata> {',
        line: 'const c = await cookies()',
        markerLine: 5,
        pointerColumn: 11,
        // eslint-disable-next-line no-template-curly-in-string -- literal `${…}` is part of the rendered code-frame snippet
        afterLine: 'return { title: `Cookies: ${c.getAll().length}` }',
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
        'Route "/13-fetch-in-metadata": Next.js encountered uncached data in `generateMetadata()`.\n\nThis route\'s metadata is blocked, but the rest of its content can be prerendered. `fetch(...)` or `connection()` accessed in `generateMetadata()` cause it to run dynamically.\n\nWays to fix this:\n  - [cache] Cache the metadata with `"use cache"` in `generateMetadata()`\n  - [dynamic] Render a marker component that calls `await connection()` inside `<Suspense>` on the page\n\nLearn more: https://nextjs.org/docs/messages/blocking-prerender-metadata-dynamic'
      ),
      { __NEXT_ERROR_CODE: 'E1308' }
    ),
    frames: createStoryFrames({
      reason:
        'Route "/13-fetch-in-metadata": Next.js encountered uncached data in `generateMetadata()`.',
      file: 'app/13-fetch-in-metadata/page.tsx',
      methodName: 'generateMetadata',
      line: 8,
      column: 21,
      codeFrame: instantCodeFrame({
        beforeLine:
          'export async function generateMetadata(): Promise<Metadata> {',
        line: 'const res = await fetch("http://example.com", { cache: "no-store" })',
        markerLine: 8,
        pointerColumn: 21,
        // eslint-disable-next-line no-template-curly-in-string -- literal `${…}` is part of the rendered code-frame snippet
        afterLine: 'return { title: `Status: ${res.status}` }',
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
        'Route "/39-date-now-no-instant": Next.js encountered `Date.now()` without an explicit rendering intent.\n\nThis value can change between renders, so it must be either prerendered or computed later.\n\nWays to fix this:\n  - [dynamic] Render at request time by adding a dynamic data access (e.g. `await connection()`) before this call\n  - [cache] Prerender and cache the value with `"use cache"`\n  - [client] Render the value on the client with `"use client"`\n  - Measure elapsed time with `performance.now()` instead of `Date.now()`\n\nLearn more: https://nextjs.org/docs/messages/blocking-prerender-current-time'
      ),
      { __NEXT_ERROR_CODE: 'E1247' }
    ),
    frames: createStoryFrames({
      reason:
        'Route "/39-date-now-no-instant": Next.js encountered `Date.now()` without an explicit rendering intent.',
      file: 'app/39-date-now-no-instant/page.tsx',
      methodName: 'Page',
      line: 2,
      column: 17,
      codeFrame: instantCodeFrame({
        beforeLine: 'export default function Page() {',
        line: 'const value = Date.now()',
        markerLine: 2,
        pointerColumn: 17,
        afterLine: 'return <p>Now: {value}</p>',
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
        'Route "/38-math-random-no-instant": Next.js encountered `Math.random()` without an explicit rendering intent.\n\nThis value can change between renders, so it must be either prerendered or computed later.\n\nWays to fix this:\n  - [dynamic] Render at request time by adding a dynamic data access (e.g. `await connection()`) before this call\n  - [cache] Prerender and cache the value with `"use cache"`\n  - [client] Render the value on the client with `"use client"`\n\nLearn more: https://nextjs.org/docs/messages/blocking-prerender-random'
      ),
      { __NEXT_ERROR_CODE: 'E1247' }
    ),
    frames: createStoryFrames({
      reason:
        'Route "/38-math-random-no-instant": Next.js encountered `Math.random()` without an explicit rendering intent.',
      file: 'app/38-math-random-no-instant/page.tsx',
      methodName: 'Page',
      line: 2,
      column: 19,
      codeFrame: instantCodeFrame({
        beforeLine: 'export default function Page() {',
        line: 'const value = Math.random()',
        markerLine: 2,
        pointerColumn: 19,
        afterLine: 'return <p>Random: {value}</p>',
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
        'Route "/40-crypto-random-no-instant": Next.js encountered `crypto.randomUUID()` without an explicit rendering intent.\n\nThis value can change between renders, so it must be either prerendered or computed later.\n\nWays to fix this:\n  - [dynamic] Render at request time by adding a dynamic data access (e.g. `await connection()`) before this call\n  - [cache] Prerender and cache the value with `"use cache"`\n  - [client] Render the value on the client with `"use client"`\n\nLearn more: https://nextjs.org/docs/messages/blocking-prerender-crypto'
      ),
      { __NEXT_ERROR_CODE: 'E1247' }
    ),
    frames: createStoryFrames({
      reason:
        'Route "/40-crypto-random-no-instant": Next.js encountered `crypto.randomUUID()` without an explicit rendering intent.',
      file: 'app/40-crypto-random-no-instant/page.tsx',
      methodName: 'Page',
      line: 2,
      column: 25,
      codeFrame: instantCodeFrame({
        beforeLine: 'export default function Page() {',
        line: 'const value = crypto.randomUUID()',
        markerLine: 2,
        pointerColumn: 25,
        afterLine: 'return <p>UUID: {value}</p>',
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
        'Route "/44-client-math-random-no-suspense": Next.js encountered `Math.random()` in a Client Component.\n\nThis value would be evaluated during the prerender and fixed at build time, instead of recomputed on each visit.\n\nWays to fix this:\n  - [stream] Wrap the Client Component in `<Suspense fallback={...}>`\n  - [defer] Move the read into a `useEffect` or event handler\n\nLearn more: https://nextjs.org/docs/messages/blocking-prerender-random-client'
      ),
      { __NEXT_ERROR_CODE: 'E1228' }
    ),
    frames: createStoryFrames({
      reason:
        'Route "/44-client-math-random-no-suspense": Next.js encountered `Math.random()` in a Client Component.',
      file: 'app/44-client-math-random-no-suspense/random-display.tsx',
      methodName: 'RandomDisplay',
      line: 4,
      column: 19,
      codeFrame: instantCodeFrame({
        beforeLine: 'export function RandomDisplay() {',
        line: 'const value = Math.random()',
        markerLine: 4,
        pointerColumn: 19,
        afterLine: 'return <p>Random: {value}</p>',
      }),
    }),
    type: 'runtime',
  },
]

export const instantUnrenderedSegmentErrors: ReadyRuntimeError[] = [
  {
    id: 130,
    runtime: true,
    error: Object.assign(
      new Error(
        'Route "/81-instant-wrapper-unrendered-segment/trigger": Could not validate that a segment in your UI has instant navigation.\n\nThis segment was dropped from rendering. Issues that would prevent instant navigation will go undetected.\n\nDropped segment:\n  test-app/app/81-instant-wrapper-unrendered-segment/trigger/page.tsx\n\nWays to fix this:\n  - [render] Render the dropped segment\n  - [ignore] Set `export const instant = false` on the dropped segment to skip validation\n\nLearn more: https://nextjs.org/docs/messages/instant-unrendered-segment'
      ),
      { __NEXT_ERROR_CODE: 'E1286' }
    ),
    frames: () => Promise.resolve([]),
    type: 'runtime',
  },
]

export const mixedIssueAndInsightErrors: ReadyRuntimeError[] = [
  runtimeErrors[0],
  runtimeErrors[1],
  {
    id: 120,
    runtime: true,
    error: Object.assign(
      new Error(
        'Route "/nav-cookies-under-suspense": Next.js encountered runtime data during prerendering or a navigation.\n\n`cookies()`, `headers()`, `params`, or `searchParams` accessed outside of `<Suspense>` prevents the route from being prerendered or the navigation from being instant, leading to a slower user experience.\n\nWays to fix this:\n  - [stream] Provide a placeholder with `<Suspense fallback={...}>` around the data access\n  - [cache] If the runtime data is `params` and they\'re known, prerender them with `generateStaticParams`\n  - [block] Set `export const instant = false` to allow a blocking route\n\nLearn more: https://nextjs.org/docs/messages/blocking-route'
      ),
      { __NEXT_ERROR_CODE: 'E1247' }
    ),
    frames: createStoryFrames({
      reason:
        'Route "/nav-cookies-under-suspense": Next.js encountered runtime data during the initial render or a navigation.',
      file: 'app/nav-cookies-under-suspense/page.tsx',
      methodName: 'Page',
      line: 5,
      column: 15,
      codeFrame: instantCodeFrame({
        beforeLine: "import { cookies } from 'next/headers'",
        line: 'const c = await cookies()',
        markerLine: 5,
        pointerColumn: 11,
      }),
    }),
    type: 'runtime',
  },
  {
    id: 121,
    runtime: true,
    error: Object.assign(
      new Error(
        'Route "/nav-fetch-under-suspense": Next.js encountered uncached data during prerendering or a navigation.\n\n`fetch(...)` or `connection()` accessed outside of `<Suspense>` prevents the route from being prerendered or the navigation from being instant, leading to a slower user experience.\n\nWays to fix this:\n  - [cache] Cache the data access with `"use cache"`\n  - [stream] Provide a placeholder with `<Suspense fallback={...}>` around the data access\n  - [block] Set `export const instant = false` to allow a blocking route\n\nLearn more: https://nextjs.org/docs/messages/blocking-route'
      ),
      { __NEXT_ERROR_CODE: 'E1246' }
    ),
    frames: createStoryFrames({
      reason:
        'Route "/nav-fetch-under-suspense": Next.js encountered uncached data during the initial render or a navigation.',
      file: 'app/nav-fetch-under-suspense/page.tsx',
      methodName: 'Page',
      line: 6,
      column: 21,
      codeFrame: instantCodeFrame({
        beforeLine: 'export default async function Page() {',
        line: 'const res = await fetch("http://example.com", { cache: "no-store" })',
        markerLine: 6,
        pointerColumn: 21,
      }),
    }),
    type: 'runtime',
  },
]
