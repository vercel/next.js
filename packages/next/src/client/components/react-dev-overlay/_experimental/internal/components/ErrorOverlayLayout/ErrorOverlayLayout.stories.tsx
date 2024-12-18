import type { Meta, StoryObj } from '@storybook/react'
import { ErrorOverlayLayout } from './ErrorOverlayLayout'
import { withShadowPortal } from '../../storybook/with-shadow-portal'

const meta: Meta<typeof ErrorOverlayLayout> = {
  title: 'ErrorOverlayLayout',
  component: ErrorOverlayLayout,
  parameters: {
    layout: 'fullscreen',
  },
  decorators: [withShadowPortal],
}

export default meta
type Story = StoryObj<typeof ErrorOverlayLayout>

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
