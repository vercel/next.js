import type { Meta, StoryObj } from '@storybook/react'
import { NextLogo } from './next-logo'
import { withShadowPortal } from '../../storybook/with-shadow-portal'
import { withDevOverlayContexts } from '../../storybook/with-dev-overlay-contexts'

const meta: Meta<typeof NextLogo> = {
  component: NextLogo,
  parameters: {
    layout: 'centered',
  },
  args: {
    'aria-label': 'Open Next.js DevTools',
  },
  decorators: [withShadowPortal],
}

export default meta
type Story = StoryObj<typeof NextLogo>

export const NoIssues: Story = {
  decorators: [
    withDevOverlayContexts({
      totalErrorCount: 0,
      state: {
        buildingIndicator: false,
        renderingIndicator: false,
      },
    }),
  ],
}

export const SingleIssue: Story = {
  decorators: [
    withDevOverlayContexts({
      totalErrorCount: 1,
      state: {
        buildingIndicator: false,
        renderingIndicator: false,
      },
    }),
  ],
}

export const MultipleIssues: Story = {
  decorators: [
    withDevOverlayContexts({
      totalErrorCount: 5,
      state: {
        buildingIndicator: false,
        renderingIndicator: false,
      },
    }),
  ],
}

export const ManyIssues: Story = {
  decorators: [
    withDevOverlayContexts({
      totalErrorCount: 99,
      state: {
        buildingIndicator: false,
        renderingIndicator: false,
      },
    }),
  ],
}

export const Building: Story = {
  decorators: [
    withDevOverlayContexts({
      totalErrorCount: 0,
      state: {
        buildingIndicator: true,
        renderingIndicator: false,
      },
    }),
  ],
}

export const BuildingWithError: Story = {
  decorators: [
    withDevOverlayContexts({
      totalErrorCount: 1,
      state: {
        buildingIndicator: true,
        renderingIndicator: false,
      },
    }),
  ],
}

export const Rendering: Story = {
  decorators: [
    withDevOverlayContexts({
      totalErrorCount: 0,
      state: {
        buildingIndicator: false,
        renderingIndicator: true,
      },
    }),
  ],
}

export const RenderingWithError: Story = {
  decorators: [
    withDevOverlayContexts({
      totalErrorCount: 1,
      state: {
        buildingIndicator: false,
        renderingIndicator: true,
      },
    }),
  ],
}
