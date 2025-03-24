import type { Meta, StoryObj } from '@storybook/react'
import { ErrorTypeLabel } from './error-type-label'
import { withShadowPortal } from '../../../storybook/with-shadow-portal'

const meta: Meta<typeof ErrorTypeLabel> = {
  component: ErrorTypeLabel,
  parameters: {
    layout: 'centered',
  },
  decorators: [withShadowPortal],
}

export default meta
type Story = StoryObj<typeof ErrorTypeLabel>

export const BuildError: Story = {
  args: {
    errorType: 'Build Error',
  },
}

export const RuntimeError: Story = {
  args: {
    errorType: 'Runtime Error',
  },
}

export const ConsoleError: Story = {
  args: {
    errorType: 'Console Error',
  },
}

export const UnhandledRuntimeError: Story = {
  args: {
    errorType: 'Unhandled Runtime Error',
  },
}

export const MissingRequiredHTMLTag: Story = {
  args: {
    errorType: 'Missing Required HTML Tag',
  },
}
