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

export const WithStackTrace: Story = {
  args: {
    error: new Error('Boom'),
  },
}

export const WithoutStackTrace: Story = {
  args: {
    error: Object.assign(new Error('Boom'), { stack: undefined }),
  },
}
