# Next.js Claude Code Plugins

This directory contains Claude Code plugins for Next.js development.

## Using the Next.js Plugin Marketplace

The Next.js repository serves as a Claude Code plugin marketplace. Team members and contributors can install plugins directly from this repo.

### Quick Start

```bash
# Add the Next.js marketplace
/plugin marketplace add vercel/next.js

# List available plugins
/plugin list

# Install a plugin
/plugin install cache-components@nextjs
```

### Available Plugins

| Plugin | Description |
|--------|-------------|
| `cache-components` | Expert guidance for Cache Components and PPR |

## For Team Members

To auto-enable plugins for everyone working in a Next.js project, add to `.claude/settings.json`:

```json
{
  "extraKnownMarketplaces": {
    "nextjs": {
      "source": {
        "source": "github",
        "repo": "vercel/next.js"
      }
    }
  },
  "enabledPlugins": {
    "cache-components@nextjs": true
  }
}
```

## Creating New Plugins

To add a new plugin to the marketplace:

### 1. Create Plugin Directory

```bash
mkdir -p .claude-plugin/plugins/my-plugin/.claude-plugin
mkdir -p .claude-plugin/plugins/my-plugin/skills/my-skill
```

### 2. Create Plugin Manifest

**File**: `.claude-plugin/plugins/my-plugin/.claude-plugin/plugin.json`

```json
{
  "name": "my-plugin",
  "version": "1.0.0",
  "description": "What the plugin does",
  "author": {
    "name": "Next.js Team"
  }
}
```

### 3. Create Skill

**File**: `.claude-plugin/plugins/my-plugin/skills/my-skill/SKILL.md`

```yaml
---
name: my-skill
description: When to use this skill
---

# My Skill

Instructions for Claude...
```

### 4. Register in Marketplace

Add to `.claude-plugin/marketplace.json`:

```json
{
  "plugins": [
    {
      "name": "my-plugin",
      "source": "./plugins/my-plugin",
      "description": "What it does"
    }
  ]
}
```

### 5. Test Locally

```bash
claude --plugin-dir .claude-plugin/plugins/my-plugin
```

## Plugin Structure

```
.claude-plugin/
├── marketplace.json                       ← Marketplace catalog
└── plugins/
    ├── README.md                          ← This file
    └── cache-components/
        ├── .claude-plugin/
        │   └── plugin.json                ← Plugin manifest
        ├── skills/
        │   └── cache-components/
        │       ├── SKILL.md               ← Main skill file
        │       ├── REFERENCE.md           ← API reference
        │       ├── PATTERNS.md            ← Usage patterns
        │       └── TROUBLESHOOTING.md     ← Debugging guide
        └── README.md                      ← Plugin documentation
```
