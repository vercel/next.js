import type { Meta, StoryObj } from '@storybook/react'
import { ErrorPagination } from './ErrorPagination'
import { withShadowPortal } from '../../../storybook/with-shadow-portal'
import { useState } from 'react'

const meta: Meta<typeof ErrorPagination> = {
  title: 'ErrorPagination',
  component: ErrorPagination,
  parameters: {
    layout: 'centered',
  },
  decorators: [withShadowPortal],
}

export default meta
type Story = StoryObj<typeof ErrorPagination>

// Mock errors for stories
const mockErrors = [
  {
    id: 1,
    runtime: true as const,
    error: new Error('First error'),
    frames: [],
  },
  {
    id: 2,
    runtime: true as const,
    error: new Error('Second error'),
    frames: [],
  },
  {
    id: 3,
    runtime: true as const,
    error: new Error('Third error'),
    frames: [],
  },
]

export const SingleError: Story = {
  render: function ErrorPaginationStory() {
    const [activeIdx, setActiveIdx] = useState(0)
    return (
      <ErrorPagination
        activeIdx={activeIdx}
        readyErrors={[mockErrors[0]]}
        onActiveIndexChange={setActiveIdx}
      />
    )
  },
}

export const MultipleErrors: Story = {
  render: function ErrorPaginationStory() {
    const [activeIdx, setActiveIdx] = useState(1)
    return (
      <ErrorPagination
        activeIdx={activeIdx}
        readyErrors={mockErrors}
        onActiveIndexChange={setActiveIdx}
      />
    )
  },
}

export const LastError: Story = {
  render: function ErrorPaginationStory() {
    const [activeIdx, setActiveIdx] = useState(2)
    return (
      <ErrorPagination
        activeIdx={activeIdx}
        readyErrors={mockErrors}
        onActiveIndexChange={setActiveIdx}
      />
    )
  },
}
