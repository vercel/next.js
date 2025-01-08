import type { Meta, StoryObj } from '@storybook/react'
import { CallStackFrame } from './call-stack-frame'
import { withShadowPortal } from '../../storybook/with-shadow-portal'

const meta: Meta<typeof CallStackFrame> = {
  title: 'CallStackFrame',
  component: CallStackFrame,
  parameters: {
    layout: 'fullscreen',
  },
  decorators: [withShadowPortal],
}

export default meta
type Story = StoryObj<typeof CallStackFrame>

export const SimpleFrame: Story = {
  args: {
    frame: {
      originalStackFrame: {
        file: './app/page.tsx',
        methodName: 'MyComponent',
        arguments: [],
        lineNumber: 10,
        column: 5,
        ignored: false,
      },
      sourceStackFrame: {
        file: './app/page.tsx',
        methodName: 'MyComponent',
        arguments: [],
        lineNumber: 10,
        column: 5,
      },
      originalCodeFrame: 'export default function MyComponent() {',
      error: false,
      reason: null,
      external: false,
      ignored: false,
    },
  },
}
