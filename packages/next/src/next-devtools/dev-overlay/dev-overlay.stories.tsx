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
import { DevOverlayContext, useDevOverlayContext } from '../dev-overlay.browser'

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
  errors: errors,
}

export const Default: Story = {
  render: function DevOverlayStory() {
    const [state, dispatch] = useStorybookOverlayReducer(initialState)
    const { shadowRoot } = useDevOverlayContext()
    return (
      <div
        style={{
          height: '100vh',
          backgroundColor: 'black',
        }}
      >
        {/* TODO: NEXT-4643 */}
        <img
          src={imgApp}
          style={{
            width: '100%',
            height: '100vh',
            objectFit: 'contain',
          }}
        />
        <DevOverlayContext
          value={{
            dispatch,
            getSquashedHydrationErrorDetails:
              getNoSquashedHydrationErrorDetails,
            shadowRoot,
            state,
          }}
        >
          <DevOverlay />
        </DevOverlayContext>
      </div>
    )
  },
}

// todo: fix story with "Context arg provider" wrapper
export const WithPanel: Story = {
  render: function DevOverlayStory() {
    const [state, dispatch] = useStorybookOverlayReducer(initialState)
    const { shadowRoot } = useDevOverlayContext()
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
        <DevOverlayContext
          value={{
            dispatch,
            getSquashedHydrationErrorDetails:
              getNoSquashedHydrationErrorDetails,
            shadowRoot,
            state,
          }}
        >
          <DevOverlay />
        </DevOverlayContext>
      </>
    )
  },
}
