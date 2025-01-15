import type { Meta, StoryObj } from '@storybook/react'
import { Errors } from './Errors'
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

export const Default: Story = {
  args: {
    isAppDir: true,
    errors: [
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
    ],
    versionInfo: {
      installed: '15.0.0',
      staleness: 'fresh',
    },
    initialDisplayState: 'fullscreen',
    hasStaticIndicator: true,
    isTurbopack: true,
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
    initialDisplayState: 'minimized',
  },
}

export const WithHydrationWarning: Story = {
  args: {
    isAppDir: true,
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
  },
}
