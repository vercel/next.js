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
    a11y: {
      config: {
        rules: [
          {
            id: 'color-contrast',
            // Manual testing shows no violation.
            // TODO: We might have setup more explicit backgrounds depending on theme.
            enabled: false,
          },
        ],
      },
    },
  },
  decorators: [withShadowPortal],
}

export default meta
type Story = StoryObj<typeof CallStackFrame>

const frame = {
  originalCodeFrame: null,
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
  error: false as const,
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

export const AnonymousSource: Story = {
  args: {
    frame: {
      ...frame,
      originalStackFrame: {
        ...frame.originalStackFrame,
        file: '<anonymous>',
      },
    },
  },
}
