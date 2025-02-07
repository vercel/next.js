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
    firstContent: 'Server rendered content',
    secondContent: 'Client rendered content',
    hydrationMismatchType: 'text',
    reactOutputComponentDiff: undefined,
  },
}

export const TextInTagMismatch: Story = {
  args: {
    firstContent: 'Mismatched content',
    secondContent: 'p',
    hydrationMismatchType: 'text-in-tag',
    reactOutputComponentDiff: undefined,
  },
}

export const ReactUnifiedMismatch: Story = {
  args: {
    hydrationMismatchType: 'tag',
    reactOutputComponentDiff: `<Page>
  <Layout>
    <div>
-     <p>Server content</p>
+     <p>Client content</p>`,
  },
}
