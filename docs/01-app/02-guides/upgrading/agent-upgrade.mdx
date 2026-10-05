---
title: Upgrade with a coding agent
nav_title: Upgrade with a coding agent
description: Use a coding agent to upgrade and verify a Next.js app.
version: experimental
related:
  links:
    - app/getting-started/upgrading
    - app/api-reference/cli/next
    - app/api-reference/config/next-config-js/agentUpgrade
    - app/guides/ai-agents
---

Use `next upgrade --agent` to have a coding agent upgrade and verify your app. The command determines the target version from the configured policy, prepares the relevant migration guides and Skills, and hands the task to the agent.

The command supports App Router and Pages Router projects. Without `--agent`, [`next upgrade`](/docs/app/api-reference/cli/next#next-upgrade-options) runs the interactive codemod workflow instead.

## Start an upgrade

Run the latest upgrade CLI from your app's directory:

```bash filename="Terminal"
npx next@canary upgrade --agent=latest
```

From a workspace root, pass the app directory:

```bash filename="Terminal"
npx next@canary upgrade apps/web --agent=latest
```

Using `next@canary` runs the latest upgrade tooling, even when the app uses an older Next.js version. The CLI reads the version installed in the app and selects a canary target only when the app already uses a canary version. If the project's package manager sets a minimum release age, the CLI uses the newest canary that policy allows.

## Choose a policy

| Policy                | Behavior                                                                                                            |
| --------------------- | ------------------------------------------------------------------------------------------------------------------- |
| `security`            | For an affected stable version, selects the latest safe release in the earliest eligible major.                     |
| `latest`              | Moves stable, RC, beta, and preview apps to npm's `latest` stable release, or a canary app to the `canary` release. |
| `experimental-future` | Applies the `latest` policy, then adopts applicable [Future Defaults](#adopt-future-defaults).                      |

Omit the policy to use the string value from [`experimental.agentUpgrade`](/docs/app/api-reference/config/next-config-js/agentUpgrade). Otherwise, the command uses `security`:

```bash filename="Terminal"
npx next@canary upgrade --agent
```

`--agent` cannot be combined with `--revision`.

`security` supports stable installations. Canary installations can use `latest` or `experimental-future`. RC, beta, and preview installations can use `latest` to move to a newer stable release. Other prerelease channels are not supported.

### Adopt future defaults

Future Defaults are features Next.js plans to enable by default, such as Cache Components and Partial Prefetching. The `experimental-future` policy is an early version of how upgrades will help apps adopt them, even when the app already uses the latest Next.js version. Moving to a new default then becomes part of the upgrade instead of a separate migration.

For App Router projects on Next.js 16.3 or later, the policy currently prepares the Cache Components guide and adoption Skill:

```bash filename="Terminal"
npx next@canary upgrade --agent=experimental-future
```

Pages Router projects can use it for version upgrades, but it does not offer Cache Components until the project uses the App Router.

To adopt new features today, use their adoption Skills directly. See [Migrating to Cache Components](/docs/app/guides/migrating-to-cache-components#use-the-adoption-skill-recommended) and [Adopting Partial Prefetching](/docs/app/guides/adopting-partial-prefetching#use-the-adoption-skill-recommended).

## What the command does

Before starting an agent session, the CLI checks the installed version, release metadata, and any security data required by the selected policy. It stops with an explanation when no upgrade is needed or it cannot establish a target.

For a ready upgrade, the CLI copies the relevant migration guides into a temporary directory, prepares the applicable Skills, and creates a task for the selected target. For a major upgrade, the task includes the guide for every major version crossed. It also asks the agent to check for duplicate work, use a separate Git worktree when available, run the relevant checks, and verify the result.

The task also asks the agent to save the selected policy as `experimental.agentUpgrade` in `next.config` for future upgrade reminders. To disable reminders, set the option to `false`.

When you run the command inside a coding agent, the CLI prints the task for the current agent to follow. In an interactive terminal, it can start an installed Codex or Claude Code session, or copy the task for another agent. In a non-interactive terminal, it prints the task.

## Choose how to run the agent

When you start the command from an interactive terminal, it asks which installed agent to use. For a new agent session, you can also choose its model, reasoning effort, whether to use Auto permissions, and whether to use a separate Git worktree. The available choices depend on the selected agent and CLI version.

The terminal shows prompts similar to the following:

```txt filename="Terminal"
Multiple coding agents detected. Which one would you like to use?
Use ↑/↓ to choose, then press Enter.

❯ Continue with Codex
  Continue with Claude Code
  Copy prompt for another coding agent
  Cancel

Which Codex model should run the upgrade?
❯ Terra
  Sol
  Cancel

Which reasoning effort should the upgrade use?
  low
  medium
❯ high
  xhigh
  max
  ultra
  Cancel

Use Auto permission mode for Codex?
❯ Yes
  No, ask for approval
  Cancel

Open the upgrade in a separate Git worktree?
❯ Yes
  No
```

When you run the command from an existing coding agent, it provides the prepared task to that agent instead. The agent keeps the model, reasoning effort, and permissions already configured for its session.

## Configure upgrade reminders

Upgrade reminders are enabled by default with the `security` policy. Set [`experimental.agentUpgrade`](/docs/app/api-reference/config/next-config-js/agentUpgrade) to choose another policy or disable reminders:

```ts filename="next.config.ts"
import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  experimental: {
    agentUpgrade: 'latest',
  },
}

export default nextConfig
```

Set the option to `false` to disable reminders.

The option does not upgrade the app automatically. In an interactive terminal, `next dev` or `next build` continues while the reminder is open and buffers its output. **Upgrade now** stops the command before starting the upgrade. **Skip** returns to the running command and replays that output. **Skip until next version** dismisses the reminder for the installed version. See [Reminder behavior](/docs/app/api-reference/config/next-config-js/agentUpgrade#reminder-behavior) for details.

When a coding agent encounters a reminder, it reports the available upgrade and can continue the original task after retrying the command.

During `next dev`, Next.js DevTools can also show a **Vulnerability Insight** when the installed version is affected by a known security vulnerability. The insight provides a copyable prompt for starting a `security` upgrade with a coding agent.

The CLI needs access to release metadata and, for stable targets, security advisory data. If it cannot establish a target, it reports the reason without starting an agent session.
