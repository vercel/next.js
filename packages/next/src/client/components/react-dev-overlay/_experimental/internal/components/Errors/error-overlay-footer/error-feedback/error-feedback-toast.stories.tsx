import type { Meta, StoryObj } from '@storybook/react'
import { ErrorFeedbackToast } from './error-feedback-toast'
import { withShadowPortal } from '../../../../storybook/with-shadow-portal'

const meta: Meta<typeof ErrorFeedbackToast> = {
  title: 'ErrorFeedbackToast',
  component: ErrorFeedbackToast,
  parameters: {
    layout: 'centered',
  },
  decorators: [withShadowPortal],
}

export default meta
type Story = StoryObj<typeof ErrorFeedbackToast>

export const Default: Story = {}
