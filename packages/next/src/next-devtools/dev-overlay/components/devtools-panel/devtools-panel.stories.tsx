import type { Meta, StoryObj } from '@storybook/react'
import type { OverlayState } from '../../shared'

import { DevToolsPanel } from './devtools-panel'
import { INITIAL_OVERLAY_STATE } from '../../shared'
import { withShadowPortal } from '../../storybook/with-shadow-portal'

const meta: Meta<typeof DevToolsPanel> = {
  component: DevToolsPanel,
  parameters: {
    layout: 'centered',
  },
  argTypes: {},
  decorators: [withShadowPortal],
}

export default meta
type Story = StoryObj<typeof DevToolsPanel>

const state: OverlayState = {
  ...INITIAL_OVERLAY_STATE,
  routerType: 'app',
  isErrorOverlayOpen: false,
  isDevToolsPanelOpen: true,
  versionInfo: {
    installed: '15.0.0',
    expected: '15.0.0',
    staleness: 'fresh',
  },
}

export const Default: Story = {
  args: {
    state,
    dispatch: () => {},
    issueCount: 0,
  },
}

export const WithIssues: Story = {
  args: {
    state,
    dispatch: () => {},
    issueCount: 3,
  },
}

export const Turbopack: Story = {
  beforeEach: () => {
    process.env.TURBOPACK = 'true'

    // clean up callback function
    return () => {
      delete process.env.TURBOPACK
    }
  },
  args: {
    state,
    dispatch: () => {},
    issueCount: 0,
  },
}
