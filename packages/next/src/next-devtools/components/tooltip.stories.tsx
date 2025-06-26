import type { Meta, StoryObj } from '@storybook/react'
import { Tooltip, styles } from './tooltip'

const meta: Meta<typeof Tooltip> = {
  title: 'DevTools/Tooltip',
  component: Tooltip,
  parameters: {
    layout: 'centered',
    docs: {
      description: {
        component:
          'A tooltip component that displays helpful information on hover. Supports 4 directions: top, bottom, left, and right.',
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
    children: {
      control: { type: 'text' },
      description: 'The trigger element that shows the tooltip on hover',
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
    children: 'Hover me',
  },
  render: (args) => (
    <main>
      <style dangerouslySetInnerHTML={{ __html: styles }} />
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
          {args.children}
        </button>
      </Tooltip>
    </main>
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
    <main>
      <style dangerouslySetInnerHTML={{ __html: styles }} />
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(3, 120px)',
          gridTemplateRows: 'repeat(3, 60px)',
          gap: '20px',
          alignItems: 'center',
          justifyItems: 'center',
          width: '400px',
          height: '240px',
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
            width: '80px',
            height: '40px',
            backgroundColor: '#f3f4f6',
            borderRadius: '4px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '12px',
            color: '#6b7280',
          }}
        >
          Center
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
    </main>
  ),
}

// Long text tooltip
export const LongText: Story = {
  args: {
    title:
      'This is a much longer tooltip text that demonstrates how the tooltip handles wrapping and longer content. It should display properly without breaking the layout.',
    direction: 'top',
  },
  render: (args) => (
    <main>
      <style dangerouslySetInnerHTML={{ __html: styles }} />
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
          Long Tooltip
        </button>
      </Tooltip>
    </main>
  ),
}

// Different trigger elements
export const DifferentTriggers: Story = {
  parameters: {
    docs: {
      description: {
        story:
          'Tooltips can be applied to different types of elements, not just buttons.',
      },
    },
  },
  render: () => (
    <main>
      <style dangerouslySetInnerHTML={{ __html: styles }} />
      <div
        style={{
          display: 'flex',
          gap: '20px',
          alignItems: 'center',
          flexWrap: 'wrap',
        }}
      >
        <Tooltip title="Button with tooltip" direction="top">
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

        <div>
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
        </div>
      </div>

      <div
        style={{
          marginTop: '20px',
        }}
      >
        <Tooltip title="Icon with helpful information" direction="right">
          <span
            style={{
              width: '24px',
              height: '24px',
              backgroundColor: '#64748b',
              borderRadius: '50%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'white',
              fontSize: '12px',
              cursor: 'help',
            }}
          >
            ?
          </span>
        </Tooltip>
      </div>
      <div>
        <Tooltip title="Link with additional context" direction="left">
          <a
            href="#"
            style={{
              color: '#0070f3',
              textDecoration: 'underline',
            }}
            onClick={(e) => e.preventDefault()}
          >
            Link Element
          </a>
        </Tooltip>
      </div>
    </main>
  ),
}
