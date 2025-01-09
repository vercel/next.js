import type { Meta, StoryObj } from '@storybook/react'
import { DevToolsIndicator } from './dev-tools-indicator'
import { withShadowPortal } from '../../../storybook/with-shadow-portal'

const meta: Meta<typeof DevToolsIndicator> = {
  title: 'ErrorIndicator',
  component: DevToolsIndicator,
  parameters: {
    layout: 'centered',
  },
  decorators: [withShadowPortal],
}

export default meta
type Story = StoryObj<typeof DevToolsIndicator>

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

export const SingleError: Story = {
  args: {
    hasStaticIndicator: false,
    readyErrors: [mockError],
    fullscreen: () => console.log('Fullscreen clicked'),
    hide: () => console.log('Hide clicked'),
  },
}

export const MultipleErrors: Story = {
  args: {
    hasStaticIndicator: false,
    readyErrors: [mockError, { ...mockError, id: 2 }, { ...mockError, id: 3 }],
    fullscreen: () => console.log('Fullscreen clicked'),
    hide: () => console.log('Hide clicked'),
  },
}

export const WithStaticIndicator: Story = {
  args: {
    hasStaticIndicator: true,
    readyErrors: [mockError],
    fullscreen: () => console.log('Fullscreen clicked'),
    hide: () => console.log('Hide clicked'),
  },
}
