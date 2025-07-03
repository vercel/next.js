import type { Meta, StoryObj } from '@storybook/react'
import { PseudoHtmlDiff } from './component-stack-pseudo-html'
import { withShadowPortal } from '../../storybook/with-shadow-portal'

const meta: Meta<typeof PseudoHtmlDiff> = {
  component: PseudoHtmlDiff,
  parameters: {
    layout: 'fullscreen',
  },
  decorators: [withShadowPortal],
}

export default meta
type Story = StoryObj<typeof PseudoHtmlDiff>

export const TextMismatch: Story = {
  args: {
    reactOutputComponentDiff: `<Page>
  <Layout>
    <div>
-     Server content
+     Client content`,
  },
}

export const ReactUnifiedMismatch: Story = {
  args: {
    reactOutputComponentDiff:
      '<Page>\n  <Layout>\n    <div>asd\n-     <p>Server content</p>\n+     <p>Client content</p>',
  },
}
