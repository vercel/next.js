# Conductor Configuration for Next.js

This directory contains [Conductor](https://www.conductor.build/) configuration for parallel Claude Code agent development.

## What is Conductor?

Conductor is a macOS application that orchestrates multiple Claude Code agents in parallel. Each agent gets its own isolated git worktree, enabling concurrent development on different features without branch conflicts.

## Directory Structure

```
.conductor/
├── conductor.json      # Main configuration (used for new workspaces)
├── README.md           # This file
├── scripts/
│   ├── setup.sh        # Runs on workspace creation
│   └── run.sh          # Runs when starting work
└── <workspace>/        # Individual workspace directories (git worktrees, gitignored)
```

## Configuration

### Main Configuration (`conductor.json`)

The root `conductor.json` defines:

- **`scripts.setup`**: Runs when creating a new workspace
  - Enables corepack for pnpm
  - Validates Node.js version (18+)
  - Installs dependencies with `pnpm install`
  - Builds all packages with `pnpm build`

- **`scripts.run`**: Runs when starting work in a workspace
  - Starts watch mode (`pnpm --filter=next dev`) for fast iteration

- **`environment`**: Environment variables for all workspaces
  - Disables telemetry for cleaner development

- **`worktree`**: Git worktree configuration
  - Default branch to create worktrees from

## Usage

### Creating a New Workspace

In the Conductor app:
1. Add this repository
2. Create a new workspace with a descriptive name
3. The setup script will automatically install dependencies and build

### Manual Worktree Setup

If setting up worktrees manually (without Conductor app):

```bash
# Create a new worktree from canary
git worktree add ../next.js-worktrees/my-feature -b my-feature-branch canary

# Navigate to the worktree
cd ../next.js-worktrees/my-feature

# Run the setup script (same script Conductor uses)
./.conductor/scripts/setup.sh

# Or manually:
# pnpm install --prefer-offline
# pnpm build
```

## Managing Worktrees

View all worktrees:
```bash
git worktree list
```

## Best Practices

### Disk Space Management
- Each worktree uses ~500MB-1GB after build
- Run `pnpm sweep` periodically to clean Rust build artifacts
- Remove unused worktrees with `git worktree remove <path>`

### Development Workflow
1. **Never run `pnpm build` while `pnpm dev` is active** (causes build corruption)
2. Use `pnpm test-dev-turbo` for fastest test iteration
3. Use `NEXT_SKIP_ISOLATE=1` for faster test runs during development

### Parallel Agent Recommendations
- Limit to 3-4 concurrent agents to avoid:
  - GitHub API rate limits
  - Disk space exhaustion
  - System resource contention

## Troubleshooting

### Build Corruption
If builds become corrupted:
```bash
# Kill any running dev processes
pkill -f "pnpm dev"

# Clean and rebuild
pnpm clean
pnpm install
pnpm build
```

### Worktree Issues
```bash
# List worktrees with status
git worktree list

# Prune stale worktree references
git worktree prune

# Remove a worktree
git worktree remove <path>
```

## Related Documentation

- [Conductor App](https://www.conductor.build/)
- [Git Worktrees](https://git-scm.com/docs/git-worktree)
- [Next.js Contributing Guide](../contributing.md)
