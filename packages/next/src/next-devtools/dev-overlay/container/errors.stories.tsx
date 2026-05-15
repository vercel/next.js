import type { Meta, StoryObj } from '@storybook/react'

import { Errors } from './errors'
import { withShadowPortal } from '../../../../.storybook/decorators/with-shadow-portal'
import { lorem } from '../utils/lorem'
import {
  instantCurrentTimeErrors,
  instantClientMathRandomErrors,
  instantCryptoRandomUUIDErrors,
  instantMetadataErrors,
  instantMetadataUncachedErrors,
  instantMathRandomErrors,
  instantRuntimeDataErrors,
  instantUncachedDataErrors,
  instantViewportErrors,
  instantViewportUncachedErrors,
  runtimeErrors,
} from '../../../../.storybook/fixtures/errors'

const meta: Meta<typeof Errors> = {
  component: Errors,
  parameters: {
    layout: 'fullscreen',
  },
  decorators: [withShadowPortal],
}

export default meta
type Story = StoryObj<typeof Errors>

// todo: update the stories to be wrapped in context providers necessary, instead of passing props directly, before they expected props
export const Default: Story = {
  args: {
    getSquashedHydrationErrorDetails: () => null,
    runtimeErrors,
    versionInfo: {
      installed: '15.0.0',
      staleness: 'fresh',
    },
    debugInfo: { devtoolsFrontendUrl: undefined },
    isTurbopack: false,
    onClose: () => {},
  },
}

export const Turbopack: Story = {
  args: {
    ...Default.args,
    isTurbopack: true,
  },
}

export const VeryLongErrorMessage: Story = {
  args: {
    ...Default.args,
    runtimeErrors: [
      {
        ...runtimeErrors[0],
        error: Object.assign(new Error(lorem)),
      },
    ],
  },
}

export const WithHydrationWarning: Story = {
  args: {
    ...Default.args,
    runtimeErrors: [
      {
        id: 1,
        runtime: true,
        error: Object.assign(new Error('Hydration error'), {
          details: {
            warning: [
              'Text content does not match server-rendered HTML: "%s" !== "%s"',
              'Server Content',
              'Client Content',
            ],
            reactOutputComponentDiff: `<MyComponent>
  <ParentComponent>
    <div>
-     <p> hello world and welcome to my amazing website with lots of content hello world and welcome to my amazing website with lots of content </p>
+     <div> hello world and welcome to my amazing website with lots of content hello world and welcome to my amazing website with lots of content </div>`,
          },
        }),
        frames: () =>
          Promise.resolve([
            {
              error: true,
              reason: 'First error message',
              external: false,
              ignored: false,
              originalStackFrame: null,
              originalCodeFrame: null,
              sourceStackFrame: {
                file: 'app/page.tsx',
                methodName: 'Home',
                arguments: [],
                line1: 10,
                column1: 5,
              },
            },
          ]),
        type: 'runtime',
      },
    ],
    debugInfo: { devtoolsFrontendUrl: undefined },
    onClose: () => {},
  },
}

export const InstantRuntimeData: Story = {
  args: {
    ...Default.args,
    runtimeErrors: instantRuntimeDataErrors,
  },
}

export const InstantUncachedData: Story = {
  args: {
    ...Default.args,
    runtimeErrors: instantUncachedDataErrors,
  },
}

export const InstantGenerateViewport: Story = {
  args: {
    ...Default.args,
    runtimeErrors: instantViewportErrors,
  },
}

export const InstantGenerateViewportUncached: Story = {
  args: {
    ...Default.args,
    runtimeErrors: instantViewportUncachedErrors,
  },
}

export const InstantGenerateMetadata: Story = {
  args: {
    ...Default.args,
    runtimeErrors: instantMetadataErrors,
  },
}

export const InstantGenerateMetadataUncached: Story = {
  args: {
    ...Default.args,
    runtimeErrors: instantMetadataUncachedErrors,
  },
}

export const InstantCurrentTime: Story = {
  args: {
    ...Default.args,
    runtimeErrors: instantCurrentTimeErrors,
  },
}

export const InstantMathRandom: Story = {
  args: {
    ...Default.args,
    runtimeErrors: instantMathRandomErrors,
  },
}

export const InstantCryptoRandomUUID: Story = {
  args: {
    ...Default.args,
    runtimeErrors: instantCryptoRandomUUIDErrors,
  },
}

export const InstantClientMathRandom: Story = {
  args: {
    ...Default.args,
    runtimeErrors: instantClientMathRandomErrors,
  },
}
