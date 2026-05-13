---
name: update-docs
description: This skill should be used when the user asks to "update documentation for my changes", "check docs for this PR", "what docs need updating", "sync docs with code", "scaffold docs for this feature", "document this feature", "review docs completeness", "add docs for this change", "what documentation is affected", "docs impact", or mentions "docs/", "docs/01-app", "docs/02-pages", "MDX", "documentation update", "API reference", ".mdx files". Provides guided workflow for updating Next.js documentation based on code changes.
---

# Next.js Documentation Updater

Guides you through updating Next.js documentation based on code changes on the active branch. Designed for maintainers reviewing PRs for documentation completeness.

## Quick Start

1. **Analyze changes**: Run `git diff canary...HEAD --stat` to see what files changed
2. **Identify affected docs**: Map changed source files to documentation paths
3. **Review each doc**: Walk through updates with user confirmation
4. **Validate**: Run `pnpm lint` to check formatting
5. **Commit**: Stage documentation changes

## Workflow: Analyze Code Changes

### Step 1: Get the diff

```bash
# See all changed files on this branch
git diff canary...HEAD --stat

# See changes in specific areas
git diff canary...HEAD -- packages/next/src/
```

### Step 2: Identify documentation-relevant changes

Look for changes in these areas:

| Source Path                            | Likely Doc Impact           |
| -------------------------------------- | --------------------------- |
| `packages/next/src/client/components/` | Component API reference     |
| `packages/next/src/server/`            | Function API reference      |
| `packages/next/src/shared/lib/`        | Varies by export            |
| `packages/next/src/build/`             | Configuration or build docs |
| `packages/next/src/lib/`               | Various features            |

### Step 3: Map to documentation files

Use the code-to-docs mapping in `references/CODE-TO-DOCS-MAPPING.md` to find corresponding documentation files.

Example mappings:

- `src/client/components/image.tsx` → `docs/01-app/03-api-reference/02-components/image.mdx`
- `src/server/config-shared.ts` → `docs/01-app/03-api-reference/05-config/`

## Workflow: Update Existing Documentation

### Step 1: Read the current documentation

Before making changes, read the existing doc to understand:

- Current structure and sections
- Frontmatter fields in use
- Whether it uses `<AppOnly>` / `<PagesOnly>` for router-specific content

### Step 2: Identify what needs updating

Common updates include:

- **New props/options**: Add to the props table and create a section explaining usage
- **Changed behavior**: Update descriptions and examples
- **Deprecated features**: Add deprecation notices and migration guidance
- **New examples**: Add code blocks following conventions

### Step 3: Apply updates with confirmation

For each change:

1. Show the user what you plan to change
2. Wait for confirmation before editing
3. Apply the edit
4. Move to the next change

### Step 4: Check for shared content

If the doc uses the `source` field pattern (common for Pages Router docs), the source file is the one to edit. Example:

```yaml
# docs/02-pages/... file with shared content
---
source: app/building-your-application/optimizing/images
---
```

Edit the App Router source, not the Pages Router file.

### Step 5: Validate changes

```bash
pnpm lint          # Check formatting
pnpm prettier-fix  # Auto-fix formatting issues
```

## Workflow: Scaffold New Feature Documentation

Use this when adding documentation for entirely new features.

### Step 1: Determine the doc type

| Feature Type        | Doc Location                                        | Template         |
| ------------------- | --------------------------------------------------- | ---------------- |
| New component       | `docs/01-app/03-api-reference/02-components/`       | API Reference    |
| New function        | `docs/01-app/03-api-reference/04-functions/`        | API Reference    |
| New config option   | `docs/01-app/03-api-reference/05-config/`           | Config Reference |
| New concept/guide   | `docs/01-app/02-guides/`                            | Guide            |
| New file convention | `docs/01-app/03-api-reference/03-file-conventions/` | File Convention  |

### Step 2: Create the file with proper naming

- Use kebab-case: `my-new-feature.mdx`
- Add numeric prefix if ordering matters: `05-my-new-feature.mdx`
- Place in the correct directory based on feature type

### Step 3: Use the appropriate template

**API Reference Template:**

```mdx
---
title: Feature Name
description: Brief description of what this feature does.
---

{/* The content of this doc is shared between the app and pages router. You can use the `<PagesOnly>Content</PagesOnly>` component to add content that is specific to the Pages Router. Any shared content should not be wrapped in a component. */}

Brief introduction to the feature.

## Reference

### Props

<div style={{ overflowX: 'auto', width: '100%' }}>

| Prop                    | Example            | Type   | Status   |
| ----------------------- | ------------------ | ------ | -------- |
| [`propName`](#propname) | `propName="value"` | String | Required |

</div>

#### `propName`

Description of the prop.

\`\`\`tsx filename="app/example.tsx" switcher
// TypeScript example
\`\`\`

\`\`\`jsx filename="app/example.js" switcher
// JavaScript example
\`\`\`
```

**Guide Template:**

```mdx
---
title: How to do X in Next.js
nav_title: X
description: Learn how to implement X in your Next.js application.
---

Introduction explaining why this guide is useful.

## Prerequisites

What the reader needs to know before starting.

## Step 1: First Step

Explanation and code example.

\`\`\`tsx filename="app/example.tsx" switcher
// Code example
\`\`\`

## Step 2: Second Step

Continue with more steps...

## Next Steps

Related topics to explore.
```

### Step 4: Add related links

Update frontmatter with related documentation:

```yaml
related:
  title: Next Steps
  description: Learn more about related features.
  links:
    - app/api-reference/functions/related-function
    - app/guides/related-guide
```

## Documentation Conventions

See `references/DOC-CONVENTIONS.md` for complete formatting rules.

### Quick Reference

**Frontmatter (required):**

```yaml
---
title: Page Title (2-3 words)
description: One or two sentences describing the page.
---
```

**Code blocks:**

```
\`\`\`tsx filename="app/page.tsx" switcher
// TypeScript first
\`\`\`

\`\`\`jsx filename="app/page.js" switcher
// JavaScript second
\`\`\`
```

**Router-specific content:**

```mdx
<AppOnly>Content only for App Router docs.</AppOnly>

<PagesOnly>Content only for Pages Router docs.</PagesOnly>
```

**Notes:**

```mdx
> **Good to know**: Single line note.

> **Good to know**:
>
> - Multi-line note point 1
> - Multi-line note point 2
```

## Validation Checklist

Before committing documentation changes:

- [ ] Frontmatter has `title` and `description`
- [ ] Code blocks have `filename` attribute
- [ ] TypeScript examples use `switcher` with JS variant
- [ ] Props tables are properly formatted
- [ ] Related links point to valid paths
- [ ] `pnpm lint` passes
- [ ] Changes render correctly (if preview available)

## References

- `references/DOC-CONVENTIONS.md` - Complete frontmatter and formatting rules
- `references/CODE-TO-DOCS-MAPPING.md` - Source code to documentation mapping
