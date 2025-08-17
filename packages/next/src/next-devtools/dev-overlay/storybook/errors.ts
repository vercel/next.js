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
