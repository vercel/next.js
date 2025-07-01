import type { Meta, StoryObj } from '@storybook/react'
import { useState } from 'react'
import { IssuesTabSidebar } from './issues-tab-sidebar'
import { withShadowPortal } from '../../../../storybook/with-shadow-portal'
import { runtimeErrors } from '../../../../storybook/errors'

const meta: Meta<typeof IssuesTabSidebar> = {
  component: IssuesTabSidebar,
  parameters: {
    layout: 'centered',
  },
  decorators: [withShadowPortal],
}

export default meta
type Story = StoryObj<typeof IssuesTabSidebar>

const SidebarWrapper = ({
  runtimeErrors: errors,
  errorType,
}: {
  runtimeErrors: any[]
  errorType: string | null
}) => {
  const [activeIdx, setActiveIdx] = useState(0)

  return (
    <IssuesTabSidebar
      runtimeErrors={errors}
      errorType={errorType}
      activeIdx={activeIdx}
      setActiveIndex={setActiveIdx}
    />
  )
}

export const Default: Story = {
  render: () => (
    <SidebarWrapper runtimeErrors={runtimeErrors} errorType="runtime" />
  ),
}
