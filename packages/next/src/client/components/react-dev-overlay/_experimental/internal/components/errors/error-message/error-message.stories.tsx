import type { Meta, StoryObj } from '@storybook/react'
import { ErrorMessage } from './error-message'
import { withShadowPortal } from '../../../storybook/with-shadow-portal'

const meta: Meta<typeof ErrorMessage> = {
  component: ErrorMessage,
  parameters: {
    layout: 'fullscreen',
  },
  decorators: [withShadowPortal],
}

export default meta
type Story = StoryObj<typeof ErrorMessage>

export const ShortString: Story = {
  args: {
    errorMessage: 'A simple error message',
  },
}

export const LongString: Story = {
  args: {
    errorMessage: `
    Lorem ipsum dolor sit amet consectetur.
    Aliquet nulla ut fames eu posuere leo.
    Sed dolor lacus sit risus diam aliquam augue.
    Amet dictum donec scelerisque morbi aliquam volutpat.
    Sit nec sit faucibus elit id ultrices est.
    Nunc elementum fames at mattis nisi.
    Quisque lectus nec ultrices morbi aliquam vestibulum.
    Tempor quis volutpat urna proin.
    `,
  },
}

export const ReactNode: Story = {
  args: {
    errorMessage: (
      <span>
        An error message with <strong>formatted</strong> content
      </span>
    ),
  },
}
