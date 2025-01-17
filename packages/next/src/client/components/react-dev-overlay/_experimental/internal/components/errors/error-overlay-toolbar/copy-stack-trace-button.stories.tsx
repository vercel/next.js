import type { Meta, StoryObj } from '@storybook/react'
import { CopyStackTraceButton } from './copy-stack-trace-button'
import { withShadowPortal } from '../../../storybook/with-shadow-portal'

const meta: Meta<typeof CopyStackTraceButton> = {
  component: CopyStackTraceButton,
  parameters: {
    layout: 'centered',
  },
  decorators: [withShadowPortal],
}

export default meta
type Story = StoryObj<typeof CopyStackTraceButton>

const errorWithStack = new Error('Test error')
errorWithStack.stack = `Error: Test error
    at Context.<anonymous> (test.ts:1:1)
    at processImmediate (node:internal/timers:466:21)`

export const WithStackTrace: Story = {
  args: {
    error: errorWithStack,
  },
}

export const WithoutStackTrace: Story = {
  args: {
    error: new Error('Error without stack'),
  },
}

export const Disabled: Story = {
  args: {
    error: undefined,
  },
}
