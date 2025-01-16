import type { Meta, StoryObj } from '@storybook/react'
import ReactDevOverlay from './react-dev-overlay'
import { useEffect } from 'react'
import { ACTION_UNHANDLED_ERROR, type UnhandledErrorAction } from '../../shared'

const meta: Meta<typeof ReactDevOverlay> = {
  component: ReactDevOverlay,
  parameters: {
    layout: 'fullscreen',
  },
}

export default meta
type Story = StoryObj<typeof ReactDevOverlay>

export const Default: Story = {
  args: {
    children: <div>Application Content</div>,
  },
}

export const WithRuntimeError: Story = {
  args: {
    children: <div>Application Content</div>,
  },
  decorators: [
    (Story) => {
      // Simulate dispatching an error event
      useEffect(() => {
        const event: UnhandledErrorAction = {
          type: ACTION_UNHANDLED_ERROR,
          reason: new Error('Runtime error example'),
          frames: [],
        }
        // Dispatch the error event after a short delay to ensure component is mounted
        setTimeout(() => {
          window.dispatchEvent(
            new CustomEvent('unhandledError', { detail: event })
          )
        }, 100)
      }, [])

      return <Story />
    },
  ],
}
