---
title: agentUpgrade
description: Configure coding agent upgrades and reminders.
version: experimental
related:
  links:
    - app/guides/upgrading/agent-upgrade
    - app/guides/ai-agents
    - app/api-reference/cli/next
---

The `experimental.agentUpgrade` option selects the default policy for [`next upgrade --agent`](/docs/app/guides/upgrading/agent-upgrade) and controls upgrade reminders during `next dev` and `next build`. It uses the `security` policy by default.

```ts filename="next.config.ts" switcher highlight={5}
import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  experimental: {
    agentUpgrade: 'latest',
  },
}

export default nextConfig
```

```js filename="next.config.js" switcher highlight={4}
/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    agentUpgrade: 'latest',
  },
}

module.exports = nextConfig
```

The option accepts these values:

| Value                 | Behavior                                                                                                                                   |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| `false`               | Disables upgrade reminders.                                                                                                                |
| `security` (default)  | Checks stable installations for security advisories and recommends a safe upgrade when one is available.                                   |
| `latest`              | Recommends a newer major or minor release on the app's current stable or canary channel.                                                   |
| `experimental-future` | Uses the `latest` policy and also recommends applicable [Future Defaults](/docs/app/guides/upgrading/agent-upgrade#adopt-future-defaults). |

The option does not upgrade the app automatically. It only controls reminders and the policy used when `next upgrade --agent` does not include a value.

## Reminder behavior

In an interactive terminal, an eligible reminder during `next dev` or `next build` offers these actions. The command continues behind the prompt and buffers its output while you decide.

- **Upgrade now** stops the current command and starts `next upgrade --agent` with the configured policy.
- **Skip** returns to the running command and replays its buffered output.
- **Skip until next version** saves the dismissal for the installed version and policy.

If you don't choose within ten seconds, or the buffered output grows past about 10 MiB, the reminder skips automatically.

When a coding agent runs `next dev` or `next build`, the first eligible reminder stops the command with instructions to report the upgrade. Retrying the same command promptly continues the original task with a warning.

Reminders require the installed Next.js version to support `experimental.agentUpgrade`. Running the current canary upgrade CLI does not add reminders to an older installation.

During `next dev`, Next.js DevTools can also show a **Vulnerability Insight** when the installed version is affected by a known security vulnerability. The insight provides a copyable prompt for starting a `security` upgrade with a coding agent.

## Version History

| Version   | Changes                                                 |
| --------- | ------------------------------------------------------- |
| `v16.4.0` | `experimental.agentUpgrade` configuration option added. |
