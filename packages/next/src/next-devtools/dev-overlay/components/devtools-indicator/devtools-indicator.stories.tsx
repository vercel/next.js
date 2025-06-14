import type { Meta, StoryObj } from '@storybook/react'
import type { OverlayState } from '../../shared'

import { DevToolsIndicator } from './devtools-indicator'
import { INITIAL_OVERLAY_STATE } from '../../shared'
import { withShadowPortal } from '../../storybook/with-shadow-portal'

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

export default meta
type Story = StoryObj<typeof DevToolsIndicator>

const state: OverlayState = {
  ...INITIAL_OVERLAY_STATE,
  routerType: 'app',
  isErrorOverlayOpen: false,
}

export const Default: Story = {
  args: {
    state,
    dispatch: () => {},
  },
}

export const SingleError: Story = {
  args: {
    errorCount: 1,
    state,
    dispatch: () => {},
  },
}

export const MultipleErrors: Story = {
  args: {
    errorCount: 3,
    state,
    dispatch: () => {},
  },
}
