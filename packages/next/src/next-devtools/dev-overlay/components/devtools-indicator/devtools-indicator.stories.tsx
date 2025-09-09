import type { Meta, StoryObj } from '@storybook/react'

import { DevToolsIndicator } from './devtools-indicator'
import { withShadowPortal } from '../../storybook/with-shadow-portal'
import { withDevOverlayContexts } from '../../storybook/with-dev-overlay-contexts'
import { INITIAL_OVERLAY_STATE, type OverlayState } from '../../shared'

const meta: Meta<typeof DevToolsIndicator> = {
  component: DevToolsIndicator,
  parameters: {
    layout: 'centered',
  },
  argTypes: {},
  decorators: [
    withShadowPortal,
    // Test for high z-index
    (Story) => (
      <div
        style={{
          position: 'fixed',
          top: 0,
          left: 0,
          width: '100%',
          height: '100%',
          zIndex: 9999,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background:
            'linear-gradient(135deg, rgba(230,240,255,0.8) 0%, rgba(200,220,255,0.6) 100%)',
        }}
      >
        <Story />
      </div>
    ),
  ],
}
const state: OverlayState = {
  ...INITIAL_OVERLAY_STATE,
  routerType: 'app',
  isErrorOverlayOpen: false,
}

export default meta
type Story = StoryObj<typeof DevToolsIndicator>

export const Default: Story = {}

export const SingleError: Story = {
  decorators: [
    withDevOverlayContexts({
      state,
      totalErrorCount: 1,
    }),
  ],
}

export const MultipleErrors: Story = {
  decorators: [
    withDevOverlayContexts({
      state,
      totalErrorCount: 3,
    }),
  ],
}
