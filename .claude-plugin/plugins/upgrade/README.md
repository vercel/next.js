# Next.js Upgrade Plugin

Expert guidance for upgrading Next.js applications between major versions.

## Overview

This plugin assists with upgrading Next.js applications to the latest version using the official `@next/codemod upgrade` command. It enforces sequential upgrades (never skipping versions) and helps identify issues that require manual intervention.

## Quick Start

### Run Automated Upgrade
```bash
# Upgrade to latest version
npx @next/codemod@canary upgrade latest

# Upgrade to specific version
npx @next/codemod@canary upgrade 16
```

This command will:
1. Update your `package.json` dependencies
2. Run all applicable codemods for your upgrade path
3. Leave `@next-codemod-error` comments where manual fixes are needed

### Check for Manual Fixes
```bash
# Find locations that need manual intervention
grep -rn "@next-codemod-error" --include="*.ts" --include="*.tsx" .
```

## Official Documentation

For comprehensive upgrade guides and breaking changes:

- **[Next.js Upgrade Guide](https://nextjs.org/docs/app/building-your-application/upgrading)** - Official upgrade documentation
- **[Codemods Documentation](https://nextjs.org/docs/app/building-your-application/upgrading/codemods)** - List of all available codemods
- **[Version 16 Blog Post](https://nextjs.org/blog/next-16)** - Latest version announcement

## Installation

This plugin is part of the Next.js marketplace:

```bash
# Add Next.js marketplace
/plugin marketplace add vercel/next.js

# Install this plugin
/plugin install upgrade@nextjs
```

## Skills

- **upgrade**: Main upgrade skill that helps run the `@next/codemod upgrade` command and identify manual fixes needed