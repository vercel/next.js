import type { Meta, StoryObj } from '@storybook/react'
import { CallStackFrame } from './call-stack-frame'
import { withShadowPortal } from '../../storybook/with-shadow-portal'

const meta: Meta<typeof CallStackFrame> = {
  component: CallStackFrame,
  parameters: {
    layout: 'fullscreen',
    backgrounds: {
      default: 'background-100-dark',
    },
  },
  decorators: [withShadowPortal],
}

export default meta
type Story = StoryObj<typeof CallStackFrame>

const frame = {
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
  error: false,
  reason: null,
  external: false,
  ignored: false,
}

export const HasSource: Story = {
  args: {
    frame: {
      ...frame,
      originalCodeFrame: 'export default function MyComponent() {',
    },
  },
}

export const NoSource: Story = {
  args: {
    frame,
  },
}
