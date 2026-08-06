import type { Meta, StoryObj } from '@storybook/react'
import { Tooltip } from './tooltip'

const meta: Meta<typeof Tooltip> = {
  title: 'DevTools/Tooltip',
  component: Tooltip,
  parameters: {
    layout: 'centered',
    docs: {
      description: {
        component:
          'A tooltip component built on @base-ui-components/react/tooltip. Supports 4 directions with configurable styling.',
      },
    },
  },
  argTypes: {
    direction: {
      control: { type: 'select' },
      options: ['top', 'bottom', 'left', 'right'],
      description: 'The direction where the tooltip should appear',
    },
    title: {
      control: { type: 'text' },
      description: 'The text content of the tooltip',
    },
    arrowSize: {
      control: { type: 'range', min: 2, max: 12, step: 1 },
      description: 'Size of the tooltip arrow in pixels',
    },
    offset: {
      control: { type: 'range', min: 0, max: 20, step: 1 },
      description: 'Distance between tooltip and trigger element',
    },
  },
}

export default meta
type Story = StoryObj<typeof Tooltip>

// Default story
export const Default: Story = {
  args: {
    title: 'This is a helpful tooltip',
    direction: 'top',
    arrowSize: 6,
    offset: 8,
  },
  render: (args) => (
    <div>
      <Tooltip {...args}>
        <button
          style={{
            padding: '8px 16px',
            backgroundColor: '#0070f3',
            color: 'white',
            border: 'none',
            borderRadius: '4px',
            cursor: 'pointer',
          }}
        >
          Hover for tooltip
        </button>
      </Tooltip>
    </div>
  ),
}

// All directions story
export const AllDirections: Story = {
  parameters: {
    docs: {
      description: {
        story:
          'Demonstrates all 4 tooltip directions. Hover over each button to see the tooltip in different positions.',
      },
    },
  },
  render: () => (
    <div>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(3, 140px)',
          gridTemplateRows: 'repeat(3, 80px)',
          gap: '20px',
          alignItems: 'center',
          justifyItems: 'center',
          width: '460px',
          height: '280px',
        }}
      >
        {/* Top row - Top tooltip */}
        <div></div>
        <Tooltip title="Tooltip appears above" direction="top">
          <button
            style={{
              padding: '8px 16px',
              backgroundColor: '#10b981',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer',
              fontSize: '12px',
            }}
          >
            Top
          </button>
        </Tooltip>
        <div></div>

        {/* Middle row - Left and Right tooltips */}
        <Tooltip title="Tooltip appears to the left" direction="left">
          <button
            style={{
              padding: '8px 16px',
              backgroundColor: '#f59e0b',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer',
              fontSize: '12px',
            }}
          >
            Left
          </button>
        </Tooltip>
        <div
          style={{
            width: '100px',
            height: '60px',
            backgroundColor: '#f3f4f6',
            borderRadius: '4px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '12px',
            color: '#6b7280',
          }}
        >
          Center Element
        </div>
        <Tooltip title="Tooltip appears to the right" direction="right">
          <button
            style={{
              padding: '8px 16px',
              backgroundColor: '#8b5cf6',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer',
              fontSize: '12px',
            }}
          >
            Right
          </button>
        </Tooltip>

        {/* Bottom row - Bottom tooltip */}
        <div></div>
        <Tooltip title="Tooltip appears below" direction="bottom">
          <button
            style={{
              padding: '8px 16px',
              backgroundColor: '#ef4444',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer',
              fontSize: '12px',
            }}
          >
            Bottom
          </button>
        </Tooltip>
        <div></div>
      </div>
    </div>
  ),
}

// Different trigger elements
export const DifferentTriggers: Story = {
  parameters: {
    docs: {
      description: {
        story: 'Tooltips can be applied to different types of elements.',
      },
    },
  },
  render: () => (
    <div>
      <div
        style={{
          display: 'flex',
          gap: '20px',
          alignItems: 'center',
          flexWrap: 'wrap',
        }}
      >
        <Tooltip title="Button with helpful information" direction="top">
          <button
            style={{
              padding: '8px 16px',
              backgroundColor: '#0070f3',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer',
            }}
          >
            Button
          </button>
        </Tooltip>

        <Tooltip title="Span element with tooltip" direction="bottom">
          <span
            style={{
              padding: '4px 8px',
              backgroundColor: '#f1f5f9',
              border: '1px solid #cbd5e1',
              borderRadius: '4px',
              cursor: 'help',
            }}
          >
            Span Element
          </span>
        </Tooltip>

        <Tooltip title="Help icon with information" direction="right">
          <div
            style={{
              width: '28px',
              height: '28px',
              backgroundColor: '#64748b',
              borderRadius: '50%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'white',
              fontSize: '14px',
              cursor: 'help',
              fontWeight: 'bold',
            }}
          >
            ?
          </div>
        </Tooltip>

        <Tooltip title="Interactive link with context" direction="left">
          <a
            href="#"
            style={{
              color: '#0070f3',
              textDecoration: 'underline',
              padding: '4px',
            }}
            onClick={(e) => e.preventDefault()}
          >
            Link Element
          </a>
        </Tooltip>
      </div>
    </div>
  ),
}

// Long text content
export const LongText: Story = {
  args: {
    title:
      'This is a much longer tooltip text that demonstrates how the tooltip handles wrapping and longer content. It should display properly without breaking the layout and maintain good readability.',
    direction: 'top',
    arrowSize: 6,
    offset: 8,
  },
  render: (args) => (
    <div>
      <Tooltip {...args}>
        <button
          style={{
            padding: '8px 16px',
            backgroundColor: '#6366f1',
            color: 'white',
            border: 'none',
            borderRadius: '4px',
            cursor: 'pointer',
          }}
        >
          Long Text Tooltip
        </button>
      </Tooltip>
    </div>
  ),
}
