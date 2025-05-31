import type { Meta, StoryObj } from '@storybook/react'
import { ErrorOverlayToolbar } from './error-overlay-toolbar'
import { withShadowPortal } from '../../../storybook/with-shadow-portal'

const meta: Meta<typeof ErrorOverlayToolbar> = {
  component: ErrorOverlayToolbar,
  parameters: {
    layout: 'centered',
  },
  decorators: [withShadowPortal],
}

export default meta
type Story = StoryObj<typeof ErrorOverlayToolbar>

export const WithErrorAndDebugInfo: Story = {
  args: {
    error: new Error('Test error with stack trace'),
    debugInfo: {
      devtoolsFrontendUrl: 'chrome-devtools://devtools/bundled/inspector.html',
    },
  },
}

export const WithErrorOnly: Story = {
  args: {
    error: new Error('Test error without debug info'),
    debugInfo: undefined,
  },
}
