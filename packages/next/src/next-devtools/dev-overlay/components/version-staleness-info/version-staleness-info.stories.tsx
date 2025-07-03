import type { Meta, StoryObj } from '@storybook/react'
import { VersionStalenessInfo } from './version-staleness-info'
import { withShadowPortal } from '../../storybook/with-shadow-portal'

const meta: Meta<typeof VersionStalenessInfo> = {
  component: VersionStalenessInfo,
  parameters: {
    layout: 'centered',
  },
  decorators: [withShadowPortal],
}

export default meta
type Story = StoryObj<typeof VersionStalenessInfo>

// Mock version info for different scenarios
const mockVersionInfo = {
  fresh: {
    installed: '15.0.0',
    expected: '15.0.0',
    staleness: 'fresh' as const,
  },
  stalePatch: {
    installed: '15.0.0',
    expected: '15.0.1',
    staleness: 'stale-patch' as const,
  },
  staleMinor: {
    installed: '15.0.0',
    expected: '15.1.0',
    staleness: 'stale-minor' as const,
  },
  staleMajor: {
    installed: '14.0.0',
    expected: '15.0.0',
    staleness: 'stale-major' as const,
  },
  stalePrerelease: {
    installed: '15.0.0-canary.0',
    expected: '15.0.0-canary.1',
    staleness: 'stale-prerelease' as const,
  },
  newerThanNpm: {
    installed: '15.0.0-canary.1',
    expected: '15.0.0-canary.0',
    staleness: 'newer-than-npm' as const,
  },
}

export const Fresh: Story = {
  args: {
    versionInfo: mockVersionInfo.fresh,
  },
}

export const StalePatch: Story = {
  args: {
    versionInfo: mockVersionInfo.stalePatch,
  },
}

export const StaleMinor: Story = {
  args: {
    versionInfo: mockVersionInfo.staleMinor,
  },
}

export const StaleMajor: Story = {
  args: {
    versionInfo: mockVersionInfo.staleMajor,
  },
}

export const StalePrerelease: Story = {
  args: {
    versionInfo: mockVersionInfo.stalePrerelease,
  },
}

export const NewerThanNpm: Story = {
  args: {
    versionInfo: mockVersionInfo.newerThanNpm,
  },
}

export const Turbopack: Story = {
  args: {
    versionInfo: {
      ...mockVersionInfo.fresh,
    },
    bundlerName: 'Turbopack',
  },
}

export const Rspack: Story = {
  args: {
    versionInfo: {
      ...mockVersionInfo.fresh,
    },
    bundlerName: 'Rspack',
  },
}
