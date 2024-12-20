import type { Meta, StoryObj } from '@storybook/react'
import { ErrorPagination } from './ErrorPagination'
import { withShadowPortal } from '../../../storybook/with-shadow-portal'

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
  args: {
    activeIdx: 0,
    previous: () => console.log('Previous clicked'),
    next: () => console.log('Next clicked'),
    readyErrors: [mockErrors[0]],
    minimize: () => console.log('Minimize clicked'),
    isServerError: false,
  },
}

export const MultipleErrors: Story = {
  args: {
    activeIdx: 1,
    previous: () => console.log('Previous clicked'),
    next: () => console.log('Next clicked'),
    readyErrors: mockErrors,
    minimize: () => console.log('Minimize clicked'),
    isServerError: false,
  },
}

export const LastError: Story = {
  args: {
    activeIdx: 2,
    previous: () => console.log('Previous clicked'),
    next: () => console.log('Next clicked'),
    readyErrors: mockErrors,
    minimize: () => console.log('Minimize clicked'),
    isServerError: false,
  },
}

export const ServerError: Story = {
  args: {
    activeIdx: 0,
    previous: () => console.log('Previous clicked'),
    next: () => console.log('Next clicked'),
    readyErrors: [mockErrors[0]],
    minimize: () => console.log('Minimize clicked'),
    isServerError: true,
  },
}
