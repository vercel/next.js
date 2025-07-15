import type { Meta, StoryObj } from '@storybook/react'
import { DevOverlayStoryWrapper } from '../../../storybook/DevOverlayStoryWrapper'
import { withShadowPortal } from '../../../storybook/with-shadow-portal'
import type { VersionInfo } from '../../../../../server/dev/parse-version-info'
import {
  getStoredPanelPosition,
  STORE_KEY_SHARED_PANEL_LOCATION,
  type OverlayState,
} from '../../../shared'

const meta: Meta<typeof DevOverlayStoryWrapper> = {
  component: DevOverlayStoryWrapper,
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
type Story = StoryObj<typeof DevOverlayStoryWrapper>

// Mock version info for stories
const mockVersionInfo: VersionInfo = {
  installed: '15.1.2',
  staleness: 'stale-major',
}

const state: OverlayState = {
  routerType: 'app',
  devToolsPanelPosition: {
    [STORE_KEY_SHARED_PANEL_LOCATION]: getStoredPanelPosition(),
  },
  nextId: 1,
  buildError: null,
  errors: [],
  refreshState: { type: 'idle' },
  disableDevIndicator: false,
  showIndicator: true,
  versionInfo: mockVersionInfo,
  notFound: false,
  buildingIndicator: false,
  renderingIndicator: false,
  staticIndicator: true,
  debugInfo: { devtoolsFrontendUrl: undefined },
  isErrorOverlayOpen: false,
  showRestartServerButton: false,
  devToolsPosition: 'bottom-left',
  scale: 1,
  page: '',
}

export const StaticRoute: Story = {
  render: () => (
    <DevOverlayStoryWrapper initialState={state} runtimeErrors={[]} />
  ),
}

export const DynamicRoute: Story = {
  render: () => (
    <DevOverlayStoryWrapper
      initialState={{ ...state, staticIndicator: false }}
      runtimeErrors={[]}
    />
  ),
}

export const SingleError: Story = {
  render: () => (
    <DevOverlayStoryWrapper initialState={state} runtimeErrors={[{} as any]} />
  ),
}

export const MultipleErrors: Story = {
  render: () => (
    <DevOverlayStoryWrapper
      initialState={state}
      runtimeErrors={[{}, {}, {}] as any}
    />
  ),
}
