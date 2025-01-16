import type { Meta, StoryObj } from '@storybook/react'
import { ErrorOverlayFloatingHeader } from './error-overlay-floating-header'
import { withShadowPortal } from '../../../storybook/with-shadow-portal'

const meta: Meta<typeof ErrorOverlayFloatingHeader> = {
  component: ErrorOverlayFloatingHeader,
  parameters: {
    layout: 'fullscreen',
  },
  decorators: [withShadowPortal],
}

export default meta
type Story = StoryObj<typeof ErrorOverlayFloatingHeader>

export const Default: Story = {
  args: {
    readyErrors: [
      {
        id: 0,
        runtime: true,
        error: new Error('First error message'),
        frames: [],
      },
      {
        id: 1,
        runtime: true,
        error: new Error('Second error message'),
        frames: [],
      },
      {
        id: 2,
        runtime: true,
        error: new Error('Third error message'),
        frames: [],
      },
    ],
    activeIdx: 1,
    versionInfo: {
      installed: '15.0.0',
      staleness: 'stale-major',
    },
  },
  parameters: {
    docs: {
      story: { inline: true },
    },
  },
  decorators: [
    (Story) => (
      // Offset the translateY applied to the floating header.
      <div style={{ paddingTop: 'var(--size-10_5)' }}>
        <Story />
      </div>
    ),
  ],
}
