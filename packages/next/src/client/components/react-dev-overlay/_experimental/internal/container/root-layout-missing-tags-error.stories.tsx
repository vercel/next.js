import type { Meta, StoryObj } from '@storybook/react'
import { RootLayoutMissingTagsError } from './root-layout-missing-tags-error'
import { withShadowPortal } from '../storybook/with-shadow-portal'
import { getElementsFromShadowPortal } from '../storybook/get-elements-from-shadow-portal'
import { expect } from '@storybook/jest'

const meta: Meta<typeof RootLayoutMissingTagsError> = {
  component: RootLayoutMissingTagsError,
  parameters: {
    layout: 'fullscreen',
  },
  decorators: [withShadowPortal],
}

export default meta
type Story = StoryObj<typeof RootLayoutMissingTagsError>

const play: Story['play'] = async () => {
  const { errorTypeLabel } = getElementsFromShadowPortal()
  expect(errorTypeLabel).toHaveTextContent('Missing Required HTML Tag')
}

export const Default: Story = {
  args: {
    missingTags: ['html', 'body'],
    versionInfo: {
      installed: '15.0.0',
      staleness: 'fresh',
    },
  },
  play,
}

export const SingleTag: Story = {
  args: {
    missingTags: ['html'],
    versionInfo: {
      installed: '15.0.0',
      staleness: 'fresh',
    },
  },
  play,
}

export const Turbopack: Story = {
  args: {
    ...Default.args,
    isTurbopack: true,
  },
  play,
}
