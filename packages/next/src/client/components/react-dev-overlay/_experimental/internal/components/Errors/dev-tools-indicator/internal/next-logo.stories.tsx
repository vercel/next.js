import type { Meta, StoryObj } from '@storybook/react'
import { NextLogo } from './next-logo'
import { withShadowPortal } from '../../../../storybook/with-shadow-portal'

const meta: Meta<typeof NextLogo> = {
  component: NextLogo,
  parameters: {
    layout: 'centered',
  },
  args: {
    onClick: () => console.log('Clicked!'),
  },
  decorators: [withShadowPortal],
}

export default meta
type Story = StoryObj<typeof NextLogo>

export const NoIssues: Story = {
  args: {
    issueCount: 0,
    isDevBuilding: false,
    isDevRendering: false,
  },
}

export const SingleIssue: Story = {
  args: {
    issueCount: 1,
    isDevBuilding: false,
    isDevRendering: false,
  },
}

export const MultipleIssues: Story = {
  args: {
    issueCount: 5,
    isDevBuilding: false,
    isDevRendering: false,
  },
}

export const ManyIssues: Story = {
  args: {
    issueCount: 99,
    isDevBuilding: false,
    isDevRendering: false,
  },
}

export const Building: Story = {
  args: {
    issueCount: 0,
    isDevBuilding: true,
    isDevRendering: false,
  },
}

export const BuildingWithError: Story = {
  args: {
    issueCount: 1,
    isDevBuilding: true,
    isDevRendering: false,
  },
}

export const Rendering: Story = {
  args: {
    issueCount: 0,
    isDevBuilding: false,
    isDevRendering: true,
  },
}

export const RenderingWithError: Story = {
  args: {
    issueCount: 1,
    isDevBuilding: false,
    isDevRendering: true,
  },
}
