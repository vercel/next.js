import type { Meta, StoryObj } from '@storybook/react'
import { ErrorOverlayPagination } from './error-overlay-pagination'
import { withShadowPortal } from '../../../storybook/with-shadow-portal'
import { useState } from 'react'

const meta: Meta<typeof ErrorOverlayPagination> = {
  component: ErrorOverlayPagination,
  parameters: {
    layout: 'centered',
  },
  decorators: [withShadowPortal],
}

export default meta
type Story = StoryObj<typeof ErrorOverlayPagination>

// Mock errors for stories
const mockErrors = [
  {
    id: 1,
    runtime: true as const,
    error: new Error('First error'),
    frames: () => Promise.resolve([]),
  },
  {
    id: 2,
    runtime: true as const,
    error: new Error('Second error'),
    frames: () => Promise.resolve([]),
  },
  {
    id: 3,
    runtime: true as const,
    error: new Error('Third error'),
    frames: () => Promise.resolve([]),
  },
]

export const SingleError: Story = {
  render: function ErrorOverlayPaginationStory() {
    const [activeIdx, setActiveIdx] = useState(0)
    return (
      <ErrorOverlayPagination
        activeIdx={activeIdx}
        readyErrors={[mockErrors[0]]}
        onActiveIndexChange={setActiveIdx}
      />
    )
  },
}

export const MultipleErrors: Story = {
  render: function ErrorOverlayPaginationStory() {
    const [activeIdx, setActiveIdx] = useState(1)
    return (
      <ErrorOverlayPagination
        activeIdx={activeIdx}
        readyErrors={mockErrors}
        onActiveIndexChange={setActiveIdx}
      />
    )
  },
}

export const LastError: Story = {
  render: function ErrorOverlayPaginationStory() {
    const [activeIdx, setActiveIdx] = useState(2)
    return (
      <ErrorOverlayPagination
        activeIdx={activeIdx}
        readyErrors={mockErrors}
        onActiveIndexChange={setActiveIdx}
      />
    )
  },
}

export const VeryManyErrors: Story = {
  render: function ErrorOverlayPaginationStory() {
    const [activeIdx, setActiveIdx] = useState(1233)
    return (
      <ErrorOverlayPagination
        activeIdx={activeIdx}
        readyErrors={Array(780).fill(mockErrors).flat()}
        onActiveIndexChange={setActiveIdx}
      />
    )
  },
}
