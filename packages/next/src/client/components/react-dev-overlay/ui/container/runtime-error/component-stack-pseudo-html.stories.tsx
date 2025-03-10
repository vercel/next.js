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

export const Default: Story = {
  args: {
    reactOutputComponentDiff: `
+ foo
- bar`,
  },
}
