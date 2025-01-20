import type { Meta, StoryObj } from '@storybook/react'
import { ErrorOverlayBottomStacks } from './error-overlay-bottom-stacks'
import { withShadowPortal } from '../../../storybook/with-shadow-portal'

const meta: Meta<typeof ErrorOverlayBottomStacks> = {
  component: ErrorOverlayBottomStacks,
  parameters: {
    layout: 'fullscreen',
  },
  decorators: [withShadowPortal],
}

export default meta
type Story = StoryObj<typeof ErrorOverlayBottomStacks>

export const SingleStack: Story = {
  args: {
    errorsCount: 2,
    activeIdx: 0,
  },
}

export const DoubleStacks: Story = {
  args: {
    errorsCount: 3,
    activeIdx: 0,
  },
}
