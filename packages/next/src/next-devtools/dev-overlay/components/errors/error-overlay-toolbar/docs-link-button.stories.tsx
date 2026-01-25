import type { Meta, StoryObj } from '@storybook/react'
import { DocsLinkButton } from './docs-link-button'
import { withShadowPortal } from '../../../storybook/with-shadow-portal'

const meta: Meta<typeof DocsLinkButton> = {
  component: DocsLinkButton,
  parameters: {
    layout: 'centered',
  },
  decorators: [withShadowPortal],
}

export default meta
type Story = StoryObj<typeof DocsLinkButton>

export const WithDocsUrl: Story = {
  args: {
    errorMessage: 'Learn more at https://nextjs.org/docs',
  },
}

export const WithoutDocsUrl: Story = {
  args: {
    errorMessage: 'An error occurred without any documentation link',
  },
}
