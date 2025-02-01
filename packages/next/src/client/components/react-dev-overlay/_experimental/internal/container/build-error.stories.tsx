import type { Meta, StoryObj } from '@storybook/react'
import { BuildError } from './build-error'
import { withShadowPortal } from '../storybook/with-shadow-portal'

const meta: Meta<typeof BuildError> = {
  component: BuildError,
  parameters: {
    layout: 'fullscreen',
  },
  decorators: [withShadowPortal],
}

export default meta
type Story = StoryObj<typeof BuildError>

export const Default: Story = {
  args: {
    message: `./src/app/page.tsx:3:3
Parsing ecmascript source code failed
  1 | export default function Home() {
  2 |   const
> 3 |   return <div>Hello World</div>
    |   ^^^^^^
  4 | }
  5 |

Expected identError: Failed to resolve import "./missing-module"`,
    versionInfo: {
      installed: '15.0.0',
      staleness: 'fresh',
    },
  },
}

export const Turbopack: Story = {
  args: {
    ...Default.args,
    isTurbopack: true,
  },
}
