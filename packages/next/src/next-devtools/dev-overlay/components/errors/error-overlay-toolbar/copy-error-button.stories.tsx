import type { Meta, StoryObj } from '@storybook/react'
import { CopyErrorButton } from './copy-error-button'
import { withShadowPortal } from '../../../storybook/with-shadow-portal'

const meta: Meta<typeof CopyErrorButton> = {
  component: CopyErrorButton,
  parameters: {
    layout: 'centered',
  },
  decorators: [withShadowPortal],
}

export default meta
type Story = StoryObj<typeof CopyErrorButton>

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
