import type { Meta, StoryObj } from '@storybook/react'

import { Errors } from './errors'
import { withShadowPortal } from '../storybook/with-shadow-portal'
import { lorem } from '../utils/lorem'
import { runtimeErrors } from '../storybook/errors'

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
    getSquashedHydrationErrorDetails: () => null,
    runtimeErrors,
    versionInfo: {
      installed: '15.0.0',
      staleness: 'fresh',
    },
    debugInfo: { devtoolsFrontendUrl: undefined },
    isTurbopack: false,
    onClose: () => {},
  },
}

export const Turbopack: Story = {
  args: {
    ...Default.args,
    isTurbopack: true,
  },
}

export const VeryLongErrorMessage: Story = {
  args: {
    ...Default.args,
    runtimeErrors: [
      {
        ...runtimeErrors[0],
        error: Object.assign(new Error(lorem)),
      },
    ],
  },
}

export const WithHydrationWarning: Story = {
  args: {
    ...Default.args,
    runtimeErrors: [
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
-     <p> hello world and welcome to my amazing website with lots of content hello world and welcome to my amazing website with lots of content </p>
+     <div> hello world and welcome to my amazing website with lots of content hello world and welcome to my amazing website with lots of content </div>`,
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
        frames: () =>
          Promise.resolve([
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
          ]),
        type: 'runtime',
      },
    ],
    debugInfo: { devtoolsFrontendUrl: undefined },
    onClose: () => {},
  },
}
