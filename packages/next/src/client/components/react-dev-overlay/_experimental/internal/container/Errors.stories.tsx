import type { Meta, StoryObj } from '@storybook/react'
import { Errors } from './Errors'
import { withShadowPortal } from '../storybook/with-shadow-portal'

const meta: Meta<typeof Errors> = {
  title: 'Errors',
  component: Errors,
  parameters: {
    layout: 'fullscreen',
  },
  decorators: [withShadowPortal],
}

export default meta
type Story = StoryObj<typeof Errors>

export const Default: Story = {
  args: {
    isAppDir: true,
    errors: [
      {
        id: 1,
        event: {
          type: 'unhandled-error',
          reason: new Error('Failed to compile'),
          frames: [],
        },
      },
    ],
    initialDisplayState: 'fullscreen',
    versionInfo: {
      installed: '15.0.0',
      staleness: 'fresh',
    },
    hasStaticIndicator: true,
    isTurbopackEnabled: true,
  },
}

export const NoErrors: Story = {
  args: {
    isAppDir: true,
    errors: [],
    initialDisplayState: 'minimized',
    versionInfo: {
      installed: '15.0.0',
      staleness: 'fresh',
    },
    hasStaticIndicator: true,
    isTurbopackEnabled: true,
  },
}
