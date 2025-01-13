import type { Meta, StoryObj } from '@storybook/react'
import { NextLogo } from './next-logo'

const meta: Meta<typeof NextLogo> = {
  component: NextLogo,
  parameters: {
    layout: 'centered',
  },
  args: {
    onClick: () => alert('Clicked!'),
  },
}

export default meta
type Story = StoryObj<typeof NextLogo>

export const NoIssues: Story = {
  args: {
    issueCount: 0,
  },
}

export const SingleIssue: Story = {
  args: {
    issueCount: 1,
  },
}

export const MultipleIssues: Story = {
  args: {
    issueCount: 5,
  },
}

export const ManyIssues: Story = {
  args: {
    issueCount: 99,
  },
}
