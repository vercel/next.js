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
    children: (
      <div style={{ margin: '1rem' }}>
        Module not found: Cannot find module './missing-module'
      </div>
    ),
  },
}

export const Turbopack: Story = {
  args: {
    ...Default.args,
    isTurbopack: true,
  },
}

export const NoErrorCode: Story = {
  args: {
    ...Default.args,
    errorCode: undefined,
  },
}

export const WithLongFooterMessage: Story = {
  args: {
    ...Default.args,
    footerMessage:
      'This is a very long footer message that demonstrates how the footer handles lengthy text. It could contain important information about the error or additional context for debugging.',
  },
}

export const WithShortFooterMessage: Story = {
  args: {
    ...Default.args,
    footerMessage: 'A brief error description.',
  },
}
