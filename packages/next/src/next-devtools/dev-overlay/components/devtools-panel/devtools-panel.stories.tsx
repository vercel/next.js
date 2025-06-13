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
