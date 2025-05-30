import type { Meta, StoryObj } from '@storybook/react'
import type { BusEvent, OverlayState } from '../shared'

// @ts-expect-error
import imgApp from './app.png'

import { useReducer } from 'react'
import { DevOverlay } from './dev-overlay'
import {
  ACTION_ERROR_OVERLAY_CLOSE,
  ACTION_ERROR_OVERLAY_OPEN,
  ACTION_ERROR_OVERLAY_TOGGLE,
} from '../shared'

const meta: Meta<typeof DevOverlay> = {
  component: DevOverlay,
  parameters: {
    layout: 'fullscreen',
  },
}

export default meta
type Story = StoryObj<typeof DevOverlay>

const initialState: OverlayState = {
  nextId: 0,
  routerType: 'app',
  buildError: null,
  disableDevIndicator: false,
  showIndicator: true,
  errors: [
    {
      id: 1,
      error: Object.assign(new Error('First error message'), {
        __NEXT_ERROR_CODE: 'E001',
      }),
      componentStackFrames: [
        {
          file: 'app/page.tsx',
          component: 'Home',
          lineNumber: 10,
          column: 5,
          canOpenInEditor: true,
        },
      ],
      frames: [
        {
          file: 'app/page.tsx',
          methodName: 'Home',
          arguments: [],
          lineNumber: 10,
          column: 5,
        },
      ],
      type: 'runtime',
    },
    {
      id: 2,
      error: Object.assign(new Error('Second error message'), {
        __NEXT_ERROR_CODE: 'E002',
      }),
      frames: [],
      type: 'runtime',
    },
    {
      id: 3,
      error: Object.assign(new Error('Third error message'), {
        __NEXT_ERROR_CODE: 'E003',
      }),
      frames: [],
      type: 'runtime',
    },
  ],
  refreshState: { type: 'idle' },
  notFound: false,
  buildingIndicator: false,
  staticIndicator: false,
  debugInfo: { devtoolsFrontendUrl: undefined },
  versionInfo: {
    installed: '15.2.0',
    staleness: 'fresh',
  },
  isErrorOverlayOpen: true,
}

function useOverlayReducer() {
  return useReducer<OverlayState, [BusEvent]>((state, action): OverlayState => {
    switch (action.type) {
      case ACTION_ERROR_OVERLAY_CLOSE: {
        return { ...state, isErrorOverlayOpen: false }
      }
      case ACTION_ERROR_OVERLAY_OPEN: {
        return { ...state, isErrorOverlayOpen: true }
      }
      case ACTION_ERROR_OVERLAY_TOGGLE: {
        return { ...state, isErrorOverlayOpen: !state.isErrorOverlayOpen }
      }
      default: {
        return state
      }
    }
    return state
  }, initialState)
}

export const Default: Story = {
  render: function DevOverlayStory() {
    const [state, dispatch] = useOverlayReducer()
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
        <DevOverlay state={state} dispatch={dispatch} />
      </>
    )
  },
}
