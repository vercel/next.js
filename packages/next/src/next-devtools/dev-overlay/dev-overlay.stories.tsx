import type { Meta, StoryObj } from '@storybook/react'
import type { OverlayState } from './shared'

// @ts-expect-error
import imgApp from './app.png'

import { DevOverlay } from './dev-overlay'
import { errors } from './storybook/errors'
import {
  storybookDefaultOverlayState,
  useStorybookOverlayReducer,
} from './storybook/use-overlay-reducer'

const meta: Meta<typeof DevOverlay> = {
  component: DevOverlay,
  parameters: {
    layout: 'fullscreen',
    a11y: {
      config: {
        rules: [
          {
            id: 'color-contrast',
            // Manual testing shows no violation.
            // TODO: We might have setup more explicit backgrounds depending on theme.
            enabled: false,
          },
        ],
      },
    },
  },
}

export default meta
type Story = StoryObj<typeof DevOverlay>

function getNoSquashedHydrationErrorDetails() {
  return null
}

const initialState: OverlayState = {
  ...storybookDefaultOverlayState,
  errors,
}

export const Default: Story = {
  render: function DevOverlayStory() {
    const [state, dispatch] = useStorybookOverlayReducer(initialState)
    return (
      <>
        <img
          src={imgApp}
          style={{
            width: '100%',
            height: '100vh',
            objectFit: 'contain',
          }}
        />
        <DevOverlay
          state={state}
          dispatch={dispatch}
          getSquashedHydrationErrorDetails={
            // Testing like App Router where we no longer quash hydration errors
            getNoSquashedHydrationErrorDetails
          }
        />
      </>
    )
  },
}

export const WithPanel: Story = {
  beforeEach: () => {
    process.env.__NEXT_DEVTOOL_NEW_PANEL_UI = 'true'

    // clean up callback function
    return () => {
      delete process.env.__NEXT_DEVTOOL_NEW_PANEL_UI
    }
  },
  render: function DevOverlayStory() {
    const [state, dispatch] = useStorybookOverlayReducer(initialState)
    return (
      <>
        <img
          src={imgApp}
          style={{
            width: '100%',
            height: '100vh',
            objectFit: 'contain',
          }}
        />
        <DevOverlay
          state={state}
          dispatch={dispatch}
          getSquashedHydrationErrorDetails={
            // Testing like App Router where we no longer quash hydration errors
            getNoSquashedHydrationErrorDetails
          }
        />
      </>
    )
  },
}
