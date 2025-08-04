import type { Meta, StoryObj } from '@storybook/react'
import { IssueFeedbackButton } from './issue-feedback-button'
import { withShadowPortal } from '../../../storybook/with-shadow-portal'

const meta: Meta<typeof IssueFeedbackButton> = {
  component: IssueFeedbackButton,
  parameters: {
    layout: 'centered',
  },
  decorators: [withShadowPortal],
}

export default meta
type Story = StoryObj<typeof IssueFeedbackButton>

export const Default: Story = {
  args: {
    errorCode: 'E001_FAKE',
  },
}
