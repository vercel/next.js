import type { Meta, StoryObj } from '@storybook/react'
import { DevToolsIndicator } from './dev-tools-indicator'
import { withShadowPortal } from '../../../storybook/with-shadow-portal'
import type { VersionInfo } from '../../../../../../../../server/dev/parse-version-info'

const meta: Meta<typeof DevToolsIndicator> = {
  component: DevToolsIndicator,
  parameters: {
    layout: 'centered',
  },
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

// Mock version info for stories
const mockVersionInfo: VersionInfo = {
  installed: '15.1.2',
  staleness: 'stale-major',
}

// Mock error for stories
const mockError = {
  id: 1,
  runtime: true as const,
  error: new Error('Test error'),
  frames: [
    {
      error: true,
      reason: null,
      external: false,
      ignored: false,
      sourceStackFrame: {
        file: 'test.js',
        methodName: '<unknown>',
        arguments: [],
        lineNumber: 1,
        column: 1,
      },
    },
  ],
}

export const NoErrors: Story = {
  args: {
    hasStaticIndicator: false,
    readyErrors: [],
    fullscreen: () => console.log('Fullscreen clicked'),
    hide: () => console.log('Hide clicked'),
    versionInfo: mockVersionInfo,
    isTurbopack: false,
  },
}

export const SingleError: Story = {
  args: {
    hasStaticIndicator: false,
    readyErrors: [mockError],
    fullscreen: () => console.log('Fullscreen clicked'),
    hide: () => console.log('Hide clicked'),
    versionInfo: mockVersionInfo,
  },
}

export const MultipleErrors: Story = {
  args: {
    hasStaticIndicator: false,
    readyErrors: [mockError, { ...mockError, id: 2 }, { ...mockError, id: 3 }],
    fullscreen: () => console.log('Fullscreen clicked'),
    hide: () => console.log('Hide clicked'),
    versionInfo: mockVersionInfo,
  },
}

export const WithStaticIndicator: Story = {
  args: {
    hasStaticIndicator: true,
    readyErrors: [mockError],
    fullscreen: () => console.log('Fullscreen clicked'),
    hide: () => console.log('Hide clicked'),
    versionInfo: mockVersionInfo,
  },
}
