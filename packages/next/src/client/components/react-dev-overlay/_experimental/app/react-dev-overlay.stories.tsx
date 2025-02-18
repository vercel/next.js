import type { Meta, StoryObj } from '@storybook/react'
import type { OverlayState } from '../../shared'

import ReactDevOverlay from './react-dev-overlay'
import { ACTION_UNHANDLED_ERROR } from '../../shared'

// @ts-expect-error
import imgApp from './app.png'

const meta: Meta<typeof ReactDevOverlay> = {
  component: ReactDevOverlay,
  parameters: {
    layout: 'fullscreen',
  },
}

export default meta
type Story = StoryObj<typeof ReactDevOverlay>

const state: OverlayState = {
  nextId: 0,
  buildError: null,
  errors: [
    {
      id: 1,
      event: {
        type: ACTION_UNHANDLED_ERROR,
        reason: Object.assign(new Error('First error message'), {
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
      },
    },
    {
      id: 2,
      event: {
        type: ACTION_UNHANDLED_ERROR,
        reason: Object.assign(new Error('Second error message'), {
          __NEXT_ERROR_CODE: 'E002',
        }),
        frames: [],
      },
    },
    {
      id: 3,
      event: {
        type: ACTION_UNHANDLED_ERROR,
        reason: Object.assign(new Error('Third error message'), {
          __NEXT_ERROR_CODE: 'E003',
        }),
        frames: [],
      },
    },
  ],
  refreshState: { type: 'idle' },
  rootLayoutMissingTags: [],
  notFound: false,
  staticIndicator: false,
  debugInfo: { devtoolsFrontendUrl: undefined },
  versionInfo: {
    installed: '14.2.0',
    staleness: 'fresh',
  },
}

export const Default: Story = {
  args: {
    state,
    children: (
      <div>
        <img
          src={imgApp}
          style={{
            width: '100%',
            height: '100%',
            objectFit: 'contain',
          }}
        />
      </div>
    ),
  },
}
