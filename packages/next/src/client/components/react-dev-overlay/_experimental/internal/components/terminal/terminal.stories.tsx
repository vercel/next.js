import type { Meta, StoryObj } from '@storybook/react'
import { Terminal } from './terminal'
import { withShadowPortal } from '../../storybook/with-shadow-portal'

const meta: Meta<typeof Terminal> = {
  component: Terminal,
  parameters: {
    layout: 'fullscreen',
  },
  decorators: [withShadowPortal],
}

export default meta
type Story = StoryObj<typeof Terminal>

export const SimpleTerminal: Story = {
  args: {
    content:
      './app/page.tsx:10:5\n\u001b[31mError:\u001b[39m Something went wrong\n  at Home (./app/page.tsx:10:5)',
  },
}

export const WithImportTrace: Story = {
  args: {
    content: `./components/Button.tsx:15:3
ReactServerComponentsError: Failed to load component
Import trace for requested module:
./pages/index.tsx
./components/Layout.tsx
./components/Button.tsx`,
  },
}

export const WithAnsiColors: Story = {
  args: {
    content: `./app/error.tsx:5:10
\u001b[31m\u001b[1mError:\u001b[22m\u001b[39m Failed to compile
\u001b[36m  console\u001b[39m.\u001b[33mlog\u001b[39m('Debug message')
\u001b[32m✓\u001b[39m Success message
\u001b[31m✕\u001b[39m Error message`,
  },
}
