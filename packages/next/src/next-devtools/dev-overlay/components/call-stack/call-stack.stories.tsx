import type { Meta, StoryObj } from '@storybook/react'
import { useState } from 'react'
import { CallStack } from './call-stack'
import { withShadowPortal } from '../../storybook/with-shadow-portal'

const meta: Meta<typeof CallStack> = {
  component: CallStack,
  parameters: {
    layout: 'fullscreen',
    backgrounds: {
      default: 'background-100-dark',
    },
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
  decorators: [withShadowPortal],
}

export default meta
type Story = StoryObj<typeof CallStack>

const frame = {
  originalStackFrame: {
    file: './app/page.tsx',
    methodName: 'MyComponent',
    arguments: [],
    line1: 10,
    column1: 5,
    ignored: false,
  },
  sourceStackFrame: {
    file: './app/page.tsx',
    methodName: 'MyComponent',
    arguments: [],
    line1: 10,
    column1: 5,
  },
  originalCodeFrame: 'export default function MyComponent() {',
  error: false as const,
  reason: null,
  external: false,
  ignored: false,
}

const ignoredFrame = {
  ...frame,
  ignored: true,
}

export const SingleFrame: Story = {
  args: {
    frames: [frame],
    isIgnoreListOpen: false,
    ignoredFramesTally: 0,
    onToggleIgnoreList: () => {},
    selectedFrameIndex: 0,
    onFrameSelect: () => {},
    tabGroupId: 'storybook-call-stack',
  },
}

const multipleFrames = [
  frame,
  {
    ...frame,
    originalStackFrame: {
      ...frame.originalStackFrame,
      methodName: 'ParentComponent',
      lineNumber: 5,
    },
  },
  ...Array(5).fill(ignoredFrame),
  {
    ...frame,
    originalStackFrame: {
      ...frame.originalStackFrame,
      methodName: 'GrandparentComponent',
      lineNumber: 1,
    },
  },
  ...Array(5).fill(ignoredFrame),
]

function InteractiveCallStack() {
  const [selectedFrameIndex, setSelectedFrameIndex] = useState<number | null>(0)
  return (
    <CallStack
      frames={multipleFrames}
      isIgnoreListOpen={false}
      ignoredFramesTally={10}
      onToggleIgnoreList={() => {}}
      selectedFrameIndex={selectedFrameIndex}
      onFrameSelect={setSelectedFrameIndex}
      tabGroupId="storybook-call-stack"
    />
  )
}

export const MultipleFrames: Story = {
  render: () => <InteractiveCallStack />,
}
