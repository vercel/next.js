import type { Meta, StoryObj } from '@storybook/react'
import { EnvironmentNameLabel } from './environment-name-label'
import { withShadowPortal } from '../../../storybook/with-shadow-portal'

const meta: Meta<typeof EnvironmentNameLabel> = {
  component: EnvironmentNameLabel,
  parameters: {
    layout: 'centered',
  },
  decorators: [withShadowPortal],
}

export default meta
type Story = StoryObj<typeof EnvironmentNameLabel>

export const Server: Story = {
  args: {
    environmentName: 'Server',
  },
}

export const Prerender: Story = {
  args: {
    environmentName: 'Prerender',
  },
}

export const Cache: Story = {
  args: {
    environmentName: 'Cache',
  },
}
