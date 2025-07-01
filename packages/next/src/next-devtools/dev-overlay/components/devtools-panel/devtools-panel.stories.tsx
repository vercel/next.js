import type { Meta, StoryObj } from '@storybook/react'
import type { OverlayState } from '../../shared'

import { DevToolsPanel } from './devtools-panel'
import { INITIAL_OVERLAY_STATE } from '../../shared'
import { withShadowPortal } from '../../storybook/with-shadow-portal'
import { runtimeErrors } from '../../storybook/errors'

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
    runtimeErrors: [],
    getSquashedHydrationErrorDetails: () => null,
  },
}

export const WithIssues: Story = {
  args: {
    state,
    dispatch: () => {},
    issueCount: runtimeErrors.length,
    runtimeErrors,
    getSquashedHydrationErrorDetails: () => null,
  },
}

export const Turbopack: Story = {
  beforeEach: () => {
    process.env.__NEXT_BUNDLER = 'Turbopack'

    // clean up callback function
    return () => {
      delete process.env.__NEXT_BUNDLER
    }
  },
  args: {
    state,
    dispatch: () => {},
    issueCount: 0,
    runtimeErrors: [],
    getSquashedHydrationErrorDetails: () => null,
  },
}

export const Rspack: Story = {
  beforeEach: () => {
    process.env.__NEXT_BUNDLER = 'Rspack'

    // clean up callback function
    return () => {
      delete process.env.__NEXT_BUNDLER
    }
  },
  args: {
    state,
    dispatch: () => {},
    issueCount: 0,
    runtimeErrors: [],
    getSquashedHydrationErrorDetails: () => null,
  },
}
