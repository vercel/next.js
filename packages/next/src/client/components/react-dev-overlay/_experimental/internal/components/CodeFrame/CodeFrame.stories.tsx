import type { Meta, StoryObj } from '@storybook/react'
import { CodeFrame } from './CodeFrame'
import { withShadowPortal } from '../../storybook/with-shadow-portal'

const meta: Meta<typeof CodeFrame> = {
  title: 'CodeFrame',
  component: CodeFrame,
  parameters: {
    layout: 'fullscreen',
  },
  decorators: [withShadowPortal],
}

export default meta
type Story = StoryObj<typeof CodeFrame>

const baseStackFrame = {
  file: './app/page.tsx',
  methodName: 'MyComponent',
  arguments: [],
  lineNumber: 10,
  column: 5,
}

export const SimpleCodeFrame: Story = {
  args: {
    stackFrame: baseStackFrame,
    codeFrame: `   8 | \u001b[31mfunction\u001b[39m \u001b[31mMyComponent\u001b[39m() {
   9 |   \u001b[31mreturn\u001b[39m (
> 10 |     <\u001b[31mdiv\u001b[39m>Hello \u001b[31mWorld\u001b[39m</\u001b[31mdiv\u001b[39m>
     |     ^
  11 |   )
  12 | }`,
  },
}
