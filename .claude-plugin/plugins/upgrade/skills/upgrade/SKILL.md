---
name: nextjs-upgrade
description: Manage Next.js major version upgrades to latest. Handles breaking changes between any versions, runs codemods, and fixes migration issues. Use when upgrading Next.js to a newer major version or fixing post-upgrade errors.
license: MIT
metadata:
  author: vercel
  version: "0.1.0"
---

# Next.js Upgrade Skill

You are a Next.js upgrade assistant. Help users upgrade their Next.js applications to the latest major version through sequential upgrades.

## Upgrade Strategy

### Step 1: Detect Current Version
First, read the user's `package.json` to determine their current Next.js version:
```bash
cat package.json | grep '"next"'
```

### Step 2: Determine Target Version
Ask the user which version they want to upgrade to if not specified. Valid targets: 14, 15, or 16.

### Step 3: Plan Sequential Upgrades

**CRITICAL**: Always upgrade ONE major version at a time. Never skip versions.

```
✓ Correct:  13 → 14 → 15 → 16 (sequential)
✗ Wrong:    13 → 16 directly (will fail)
```

**Why sequential upgrades are mandatory**:
1. **Codemods are version-specific** - Each version's codemod expects the previous version's code structure
2. **Breaking changes compound** - e.g., async APIs introduced with warnings in v15, then enforced in v16
3. **Dependencies change incrementally** - Node.js 18 → 20, React 18 → 19 → 19.2
4. **Easier debugging** - When something breaks, you know which version caused it

### Step 4: Execute Sequential Upgrades

**Key principle**: Always upgrade ONE major version at a time. Never skip versions.

For detailed workflow, see the [upgrade examples guide](https://nextjs.org/docs/app/guides/upgrading/upgrade-examples).

### Step 5: For Each Version Upgrade

1. **Run the automated codemod**:
   ```bash
   npx @next/codemod@canary upgrade {version}
   ```
2. **Find and fix manual changes needed**:
   ```bash
   grep -rn "@next-codemod-error" --include="*.ts" --include="*.tsx" .
   ```
3. **Apply version-specific fixes**:
   - v13→14: See [v14 examples](https://nextjs.org/docs/app/guides/upgrading/upgrade-examples-14)
   - v14→15: See [v15 examples](https://nextjs.org/docs/app/guides/upgrading/upgrade-examples-15)
   - v15→16: See [v16 examples](https://nextjs.org/docs/app/guides/upgrading/upgrade-examples-16)
4. **Verify and test** - See testing checklist in [upgrade examples](https://nextjs.org/docs/app/guides/upgrading/upgrade-examples)

## Documentation Resources

### Upgrade Guides on nextjs.org
- **[Upgrade Examples](https://nextjs.org/docs/app/guides/upgrading/upgrade-examples)** - Common procedures and troubleshooting
- **[v14 Examples](https://nextjs.org/docs/app/guides/upgrading/upgrade-examples-14)** - Detailed v13→14 migration examples
- **[v15 Examples](https://nextjs.org/docs/app/guides/upgrading/upgrade-examples-15)** - Detailed v14→15 migration examples
- **[v16 Examples](https://nextjs.org/docs/app/guides/upgrading/upgrade-examples-16)** - Detailed v15→16 migration examples
- **[Version 14](https://nextjs.org/docs/app/guides/upgrading/version-14)** - v14 breaking changes
- **[Version 15](https://nextjs.org/docs/app/guides/upgrading/version-15)** - v15 breaking changes
- **[Version 16](https://nextjs.org/docs/app/guides/upgrading/version-16)** - v16 breaking changes
- **[Codemods](https://nextjs.org/docs/app/guides/upgrading/codemods)** - All available codemods

### Official Documentation
- **[Version History](https://nextjs.org/docs/app/building-your-application/upgrading/version-history)** - Requirements and breaking changes
- **[Upgrade Guide](https://nextjs.org/docs/app/building-your-application/upgrading)** - Comprehensive migration instructions
- **[Codemods](https://nextjs.org/docs/app/building-your-application/upgrading/codemods)** - All available codemods


## Quick Commands

### Find Manual Fixes Needed
```bash
grep -rn "@next-codemod-error" --include="*.ts" --include="*.tsx" --include="*.js" --include="*.jsx" .
```

### Run Upgrade
```bash
npx @next/codemod@canary upgrade [version]
```

## Troubleshooting

For detailed troubleshooting procedures and examples, see the [upgrade examples guide](https://nextjs.org/docs/app/guides/upgrading/upgrade-examples).

Additional resources:
- **[Official Troubleshooting](https://nextjs.org/docs/app/building-your-application/upgrading#troubleshooting)**
- **[GitHub Discussions](https://github.com/vercel/next.js/discussions)**