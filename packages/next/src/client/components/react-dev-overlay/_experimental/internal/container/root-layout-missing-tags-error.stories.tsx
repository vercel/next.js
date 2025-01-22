import type { Meta, StoryObj } from '@storybook/react'
import { RootLayoutMissingTagsError } from './root-layout-missing-tags-error'
import { withShadowPortal } from '../storybook/with-shadow-portal'

const meta: Meta<typeof RootLayoutMissingTagsError> = {
  component: RootLayoutMissingTagsError,
  parameters: {
    layout: 'fullscreen',
  },
  decorators: [withShadowPortal],
}

export default meta
type Story = StoryObj<typeof RootLayoutMissingTagsError>

export const Default: Story = {
  args: {
    missingTags: ['html', 'body'],
    versionInfo: {
      installed: '15.0.0',
      staleness: 'fresh',
    },
  },
}

export const SingleTag: Story = {
  args: {
    missingTags: ['html'],
    versionInfo: {
      installed: '15.0.0',
      staleness: 'fresh',
    },
  },
}

export const Turbopack: Story = {
  args: {
    ...Default.args,
    isTurbopack: true,
  },
}
