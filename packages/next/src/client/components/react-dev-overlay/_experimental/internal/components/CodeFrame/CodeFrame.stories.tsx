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
    codeFrame: `   8 | function MyComponent() {
   9 |   return (
> 10 |     <div>Hello World</div>
     |     ^
  11 |   )
  12 | }`,
  },
}

export const WithSyntaxHighlighting: Story = {
  args: {
    stackFrame: baseStackFrame,
    codeFrame: `   8 | function MyComponent() {
   9 |   return (
> 10 |     \u001b[31m<div>\u001b[39mHello World\u001b[31m</div>\u001b[39m
     |     ^
  11 |   )
  12 | }`,
  },
}

export const LongIndentation: Story = {
  args: {
    stackFrame: baseStackFrame,
    codeFrame: `   8 |     function deeplyNested() {
   9 |         return (
> 10 |             <div>
     |             ^
  11 |                 Deeply Nested Content
  12 |             </div>`,
  },
}
