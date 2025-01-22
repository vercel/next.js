import type { Meta, StoryObj } from '@storybook/react'
import type { SupportedErrorEvent } from '../../../internal/container/Errors'
import type { ReadyRuntimeError } from '../helpers/get-error-by-type'

import { Errors } from './errors'
import { withShadowPortal } from '../storybook/with-shadow-portal'
import { ACTION_UNHANDLED_ERROR } from '../../../shared'

const meta: Meta<typeof Errors> = {
  component: Errors,
  parameters: {
    layout: 'fullscreen',
  },
  decorators: [withShadowPortal],
}

export default meta
type Story = StoryObj<typeof Errors>

const errors: SupportedErrorEvent[] = [
  {
    id: 1,
    event: {
      type: ACTION_UNHANDLED_ERROR,
      reason: Object.assign(new Error('First error message'), {
        __NEXT_ERROR_CODE: 'E001',
      }),
      componentStackFrames: [
        {
          file: 'app/page.tsx',
          component: 'Home',
          lineNumber: 10,
          column: 5,
          canOpenInEditor: true,
        },
      ],
      frames: [
        {
          file: 'app/page.tsx',
          methodName: 'Home',
          arguments: [],
          lineNumber: 10,
          column: 5,
        },
      ],
    },
  },
  {
    id: 2,
    event: {
      type: ACTION_UNHANDLED_ERROR,
      reason: Object.assign(new Error('Second error message'), {
        __NEXT_ERROR_CODE: 'E002',
      }),
      frames: [],
    },
  },
  {
    id: 3,
    event: {
      type: ACTION_UNHANDLED_ERROR,
      reason: Object.assign(new Error('Third error message'), {
        __NEXT_ERROR_CODE: 'E003',
      }),
      frames: [],
    },
  },
  {
    id: 4,
    event: {
      type: ACTION_UNHANDLED_ERROR,
      reason: Object.assign(new Error('Fourth error message'), {
        __NEXT_ERROR_CODE: 'E004',
      }),
      frames: [],
    },
  },
]

const readyErrors: ReadyRuntimeError[] = [
  {
    id: 1,
    runtime: true,
    error: errors[0].event.reason,
    frames: [],
  },
]

export const Default: Story = {
  args: {
    errors,
    readyErrors,
    versionInfo: {
      installed: '15.0.0',
      staleness: 'fresh',
    },
    hasStaticIndicator: true,
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
    errors: [
      {
        id: 1,
        event: {
          type: ACTION_UNHANDLED_ERROR,
          reason: Object.assign(new Error('Hydration error'), {
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
          frames: [],
        },
      },
    ],
    readyErrors: [],
    debugInfo: { devtoolsFrontendUrl: undefined },
    onClose: () => {},
  },
}
