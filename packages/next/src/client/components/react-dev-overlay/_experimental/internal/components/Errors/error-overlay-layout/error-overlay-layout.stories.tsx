import type { Meta, StoryObj } from '@storybook/react'
import { ErrorOverlayLayout } from './error-overlay-layout'
import { withShadowPortal } from '../../../storybook/with-shadow-portal'

const meta: Meta<typeof ErrorOverlayLayout> = {
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
    errorCode: 'E001',
    versionInfo: {
      installed: '15.0.0',
      staleness: 'fresh',
    },
    children: "Module not found: Cannot find module './missing-module'",
  },
}

export const Turbopack: Story = {
  args: {
    ...Default.args,
    isTurbopack: true,
  },
}
