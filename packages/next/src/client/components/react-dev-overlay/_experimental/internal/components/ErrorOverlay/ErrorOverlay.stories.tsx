import type { Meta, StoryObj } from '@storybook/react'
import { ErrorOverlay } from './ErrorOverlay'
import { withShadowPortal } from '../../storybook/with-shadow-portal'

const meta: Meta<typeof ErrorOverlay> = {
  title: 'Overlays/ErrorOverlay',
  component: ErrorOverlay,
  parameters: {
    layout: 'fullscreen',
  },
  decorators: [withShadowPortal],
}

export default meta
type Story = StoryObj<typeof ErrorOverlay>

export const Default: Story = {
  args: {
    errorType: 'Build Error',
    errorMessage: 'Failed to compile',
    versionInfo: {
      installed: '15.0.0',
      staleness: 'fresh',
    },
    children: "Module not found: Cannot find module './missing-module'",
  },
}
