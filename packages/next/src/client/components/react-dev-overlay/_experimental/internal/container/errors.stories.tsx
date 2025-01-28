import type { Meta, StoryObj } from '@storybook/react'
import type { ReadyRuntimeError } from '../helpers/get-error-by-type'

import { Errors } from './errors'
import { withShadowPortal } from '../storybook/with-shadow-portal'

const meta: Meta<typeof Errors> = {
  component: Errors,
  parameters: {
    layout: 'fullscreen',
  },
  decorators: [withShadowPortal],
}

export default meta
type Story = StoryObj<typeof Errors>

const readyErrors: ReadyRuntimeError[] = [
  {
    id: 1,
    runtime: true,
    error: new Error('First error message'),
    frames: [
      {
        error: true,
        reason: 'First error message',
        external: false,
        ignored: false,
        sourceStackFrame: {
          file: 'app/page.tsx',
          methodName: 'Home',
          arguments: [],
          lineNumber: 10,
          column: 5,
        },
        originalStackFrame: {
          file: 'app/page.tsx',
          methodName: 'Home',
          arguments: [],
          lineNumber: 10,
          column: 5,
          ignored: false,
        },
        originalCodeFrame: `\u001b[0m \u001b[90m 1 \u001b[39m \u001b[36mexport\u001b[39m \u001b[36mdefault\u001b[39m \u001b[36mfunction\u001b[39m \u001b[33mHome\u001b[39m() {\u001b[0m
\u001b[0m\u001b[31m\u001b[1m>\u001b[22m\u001b[39m\u001b[90m 2 \u001b[39m   \u001b[36mthrow\u001b[39m \u001b[36mnew\u001b[39m \u001b[33mError\u001b[39m(\u001b[32m'boom'\u001b[39m)\u001b[0m
\u001b[0m \u001b[90m   \u001b[39m         \u001b[31m\u001b[1m^\u001b[22m\u001b[39m\u001b[0m
\u001b[0m \u001b[90m 3 \u001b[39m   \u001b[36mreturn\u001b[39m \u001b[33m<\u001b[39m\u001b[33mdiv\u001b[39m\u001b[33m>\u001b[39m\u001b[33mHello\u001b[39m \u001b[33mWorld\u001b[39m\u001b[33m<\u001b[39m\u001b[33m/\u001b[39m\u001b[33mdiv\u001b[39m\u001b[33m>\u001b[39m\u001b[0m
\u001b[0m \u001b[90m 4 \u001b[39m }\u001b[0m
\u001b[0m \u001b[90m 5 \u001b[39m\u001b[0m`,
      },
    ],
  },
  {
    id: 2,
    runtime: true,
    error: new Error('Second error message'),
    frames: [
      {
        error: true,
        reason: 'Second error message',
        external: false,
        ignored: false,
        sourceStackFrame: {
          file: 'app/page.tsx',
          methodName: 'Home',
          arguments: [],
          lineNumber: 10,
          column: 5,
        },
      },
    ],
  },
  {
    id: 3,
    runtime: true,
    error: new Error('Third error message'),
    frames: [
      {
        error: true,
        reason: 'Third error message',
        external: false,
        ignored: false,
        sourceStackFrame: {
          file: 'app/page.tsx',
          methodName: 'Home',
          arguments: [],
          lineNumber: 10,
          column: 5,
        },
      },
    ],
  },
  {
    id: 4,
    runtime: true,
    error: new Error('Fourth error message'),
    frames: [
      {
        error: true,
        reason: 'Fourth error message',
        external: false,
        ignored: false,
        sourceStackFrame: {
          file: 'app/page.tsx',
          methodName: 'Home',
          arguments: [],
          lineNumber: 10,
          column: 5,
        },
      },
    ],
  },
]

export const Default: Story = {
  args: {
    readyErrors,
    versionInfo: {
      installed: '15.0.0',
      staleness: 'fresh',
    },
    isTurbopack: true,
    debugInfo: { devtoolsFrontendUrl: undefined },
    onClose: () => {},
  },
}

export const Turbopack: Story = {
  args: {
    ...Default.args,
    isTurbopack: true,
  },
}

export const Minimized: Story = {
  args: {
    ...Default.args,
  },
}

export const WithHydrationWarning: Story = {
  args: {
    readyErrors: [
      {
        id: 1,
        runtime: true,
        error: Object.assign(new Error('Hydration error'), {
          details: {
            warning: [
              'Text content does not match server-rendered HTML: "%s" !== "%s"',
              'Server Content',
              'Client Content',
            ],
            reactOutputComponentDiff: `<MyComponent>
  <ParentComponent>
    <div>
-     <p> hello world </p>
+     <div> hello world </div>`,
          },
          componentStackFrames: [
            {
              component: 'MyComponent',
              file: 'app/page.tsx',
              lineNumber: 10,
              columnNumber: 5,
            },
            {
              component: 'ParentComponent',
              file: 'app/layout.tsx',
              lineNumber: 20,
              columnNumber: 3,
            },
          ],
        }),
        frames: [
          {
            error: true,
            reason: 'First error message',
            external: false,
            ignored: false,
            sourceStackFrame: {
              file: 'app/page.tsx',
              methodName: 'Home',
              arguments: [],
              lineNumber: 10,
              column: 5,
            },
          },
        ],
      },
    ],
    debugInfo: { devtoolsFrontendUrl: undefined },
    onClose: () => {},
  },
}
