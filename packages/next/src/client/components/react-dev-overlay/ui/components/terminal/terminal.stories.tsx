import type { Meta, StoryObj } from '@storybook/react'
import { Terminal } from './terminal'
import { withShadowPortal } from '../../storybook/with-shadow-portal'

const meta: Meta<typeof Terminal> = {
  component: Terminal,
  parameters: {
    layout: 'fullscreen',
    a11y: {
      config: {
        rules: [
          {
            id: 'color-contrast',
            // Manual testing shows no violation.
            // TODO: We might have setup more explicit backgrounds depending on theme.
            enabled: false,
          },
        ],
      },
    },
  },
  decorators: [withShadowPortal],
}

export default meta
type Story = StoryObj<typeof Terminal>

export const Default: Story = {
  args: {
    content: `./app/page.tsx:1:1
\x1B[31m\x1B[1mModule not found\x1B[22m\x1B[39m: Can't resolve '\x1B[32mnot-existing-module\x1B[39m'
\x1B[0m\x1B[31m\x1B[1m>\x1B[22m\x1B[39m\x1B[90m 1 |\x1B[39m \x1B[36mimport\x1B[39m \x1B[32m'not-existing-module'\x1B[39m\x1B[0m
\x1B[0m \x1B[90m   |\x1B[39m \x1B[31m\x1B[1m^\x1B[22m\x1B[39m\x1B[0m
\x1B[0m \x1B[90m 2 |\x1B[39m\x1B[0m
\x1B[0m \x1B[90m 3 |\x1B[39m \x1B[36mexport\x1B[39m \x1B[36mdefault\x1B[39m \x1B[36mfunction\x1B[39m \x1B[33mPage\x1B[39m() {\x1B[0m
\x1B[0m \x1B[90m 4 |\x1B[39m   \x1B[36mreturn\x1B[39m \x1B[33m<\x1B[39m\x1B[33mp\x1B[39m\x1B[33m>\x1B[39mhello world\x1B[33m<\x1B[39m\x1B[33m/\x1B[39m\x1B[33mp\x1B[39m\x1B[33m>\x1B[39m\x1B[0m

https://nextjs.org/docs/messages/module-not-found`,
  },
}

export const WithImportTrace: Story = {
  args: {
    content: `./app/page.tsx
Error:   \x1B[31m×\x1B[0m Expected ';', '}' or <eof>
   ╭─[\x1B[36;1;4m/hello-world/app/page.tsx\x1B[0m:2:1]
 \x1B[2m1\x1B[0m │ export default function Page() {
 \x1B[2m2\x1B[0m │   ret urn <p>hello world</p>
   · \x1B[35;1m  ─┬─\x1B[0m\x1B[33;1m ───\x1B[0m
   ·    \x1B[35;1m╰── \x1B[35;1mThis is the expression part of an expression statement\x1B[0m\x1B[0m
 \x1B[2m3\x1B[0m │ }
   ╰────

Caused by:
    Syntax Error

Import trace for requested module:
./app/page.tsx`,
  },
}
