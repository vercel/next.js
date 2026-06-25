import type { Meta, StoryObj } from '@storybook/react'
import { NextLogo } from './next-logo'
import { withShadowPortal } from '../../../../../.storybook/decorators/with-shadow-portal'
import { withDevOverlayContexts } from '../../../../../.storybook/decorators/with-dev-overlay-contexts'

const meta: Meta<typeof NextLogo> = {
  component: NextLogo,
  parameters: {
    layout: 'centered',
  },
  args: {
    'aria-label': 'Open Next.js DevTools',
    onTriggerClick: () => console.log('Logo clicked'),
  },
  decorators: [
    (Story) => (
      <div style={{ padding: '2rem' }}>
        <Story />
      </div>
    ),
    withShadowPortal,
  ],
}

export default meta
type Story = StoryObj<typeof NextLogo>

export const Idle: Story = {
  decorators: [
    withDevOverlayContexts({
      totalErrorCount: 0,
      state: {
        buildingIndicator: false,
        renderingIndicator: false,
        cacheIndicator: 'ready',
      },
    }),
  ],
}

export const Compiling: Story = {
  decorators: [
    withDevOverlayContexts({
      totalErrorCount: 0,
      state: {
        buildingIndicator: true,
        renderingIndicator: false,
        cacheIndicator: 'ready',
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
        cacheIndicator: 'ready',
      },
    }),
  ],
}

export const ColdCache: Story = {
  decorators: [
    withDevOverlayContexts({
      totalErrorCount: 0,
      state: {
        buildingIndicator: false,
        renderingIndicator: false,
        cacheIndicator: 'cold',
      },
    }),
  ],
}

export const RenderingColdCache: Story = {
  decorators: [
    withDevOverlayContexts({
      totalErrorCount: 0,
      state: {
        buildingIndicator: false,
        renderingIndicator: true,
        cacheIndicator: 'cold',
      },
    }),
  ],
}

export const CacheDisabled: Story = {
  decorators: [
    withDevOverlayContexts({
      totalErrorCount: 0,
      state: {
        buildingIndicator: false,
        renderingIndicator: false,
        cacheIndicator: 'bypass',
      },
    }),
  ],
}

export const WithSingleError: Story = {
  decorators: [
    withDevOverlayContexts({
      totalErrorCount: 1,
      state: {
        buildingIndicator: false,
        renderingIndicator: false,
        cacheIndicator: 'ready',
      },
    }),
  ],
}

export const WithMultipleErrors: Story = {
  decorators: [
    withDevOverlayContexts({
      totalErrorCount: 5,
      state: {
        buildingIndicator: false,
        renderingIndicator: false,
        cacheIndicator: 'ready',
      },
    }),
  ],
}

export const CompilingWithError: Story = {
  decorators: [
    withDevOverlayContexts({
      totalErrorCount: 1,
      state: {
        buildingIndicator: true,
        renderingIndicator: false,
        cacheIndicator: 'ready',
      },
    }),
  ],
}
