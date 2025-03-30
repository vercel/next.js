import type { Meta, StoryObj } from '@storybook/react'
import { NodejsInspectorButton } from './nodejs-inspector-button'
import { withShadowPortal } from '../../../storybook/with-shadow-portal'

const meta: Meta<typeof NodejsInspectorButton> = {
  component: NodejsInspectorButton,
  parameters: {
    layout: 'centered',
  },
  decorators: [withShadowPortal],
}

export default meta
type Story = StoryObj<typeof NodejsInspectorButton>

export const WithDevtoolsUrl: Story = {
  args: {
    devtoolsFrontendUrl: 'chrome-devtools://devtools/bundled/inspector.html',
  },
}

export const WithoutDevtoolsUrl: Story = {
  args: {
    devtoolsFrontendUrl: undefined,
  },
}
