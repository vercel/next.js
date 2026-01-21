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

For detailed workflow examples and procedures, see `docs/upgrade-examples.md`.

**Key principle**: Always upgrade ONE major version at a time.

### Step 5: For Each Version Upgrade

1. **Run the automated codemod**:
   ```bash
   npx @next/codemod@canary upgrade {version}
   ```
2. **Find and fix manual changes needed**:
   ```bash
   grep -rn "@next-codemod-error" --include="*.ts" --include="*.tsx" .
   ```
3. **Verify and test** - See testing checklist in `docs/upgrade-examples.md`

For migration examples and troubleshooting procedures, refer to `docs/upgrade-examples.md`.

## Documentation Resources

### Internal Documentation
- `docs/upgrade-examples.md` - Detailed examples, procedures, and troubleshooting
- `docs/version-14.md` - Quick reference for v14 upgrade
- `docs/version-15.md` - Quick reference for v15 upgrade
- `docs/version-16.md` - Quick reference for v16 upgrade
- `docs/codemods.md` - Codemod usage reference

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

For detailed troubleshooting procedures and examples, see `docs/upgrade-examples.md`.

Additional resources:
- **[Official Troubleshooting](https://nextjs.org/docs/app/building-your-application/upgrading#troubleshooting)**
- **[GitHub Discussions](https://github.com/vercel/next.js/discussions)**