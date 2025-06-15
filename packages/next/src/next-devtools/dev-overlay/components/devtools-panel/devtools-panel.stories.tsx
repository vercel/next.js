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

const frame = {
  originalStackFrame: {
    file: './app/page.tsx',
    methodName: 'MyComponent',
    arguments: [],
    lineNumber: 10,
    column: 5,
    ignored: false,
  },
  sourceStackFrame: {
    file: './app/page.tsx',
    methodName: 'MyComponent',
    arguments: [],
    lineNumber: 10,
    column: 5,
  },
  originalCodeFrame: 'export default function MyComponent() {',
  error: false,
  reason: null,
  external: false,
  ignored: false,
}

const ignoredFrame = {
  ...frame,
  ignored: true,
}

export const WithIssues: Story = {
  args: {
    state,
    dispatch: () => {},
    issueCount: 3,
    runtimeErrors: [
      {
        id: 1,
        runtime: true,
        error: new Error('First error message'),
        frames: () =>
          Promise.resolve([
            frame,
            {
              ...frame,
              originalStackFrame: {
                ...frame.originalStackFrame,
                methodName: 'ParentComponent',
                lineNumber: 5,
              },
            },
            {
              ...frame,
              originalStackFrame: {
                ...frame.originalStackFrame,
                methodName: 'GrandparentComponent',
                lineNumber: 1,
              },
            },
            ...Array(20).fill(ignoredFrame),
          ]),
        type: 'runtime',
      },
      {
        id: 2,
        runtime: true,
        error: new Error('Second error message'),
        frames: () =>
          Promise.resolve([
            frame,
            {
              ...frame,
              originalStackFrame: {
                ...frame.originalStackFrame,
                methodName: 'ParentComponent',
                lineNumber: 5,
              },
            },
            {
              ...frame,
              originalStackFrame: {
                ...frame.originalStackFrame,
                methodName: 'GrandparentComponent',
                lineNumber: 1,
              },
            },
            ...Array(20).fill(ignoredFrame),
          ]),
        type: 'runtime',
      },
    ],
    getSquashedHydrationErrorDetails: () => null,
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
    runtimeErrors: [],
    getSquashedHydrationErrorDetails: () => null,
  },
}
