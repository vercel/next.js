# Next.js Documentation Conventions

Complete reference for frontmatter schema, code block formatting, and MDX component usage.

## Frontmatter Schema

All MDX files must start with YAML frontmatter enclosed in `---` delimiters.

### Required Fields

| Field         | Description                                 | Example                                          |
| ------------- | ------------------------------------------- | ------------------------------------------------ |
| `title`       | Page title for SEO and headings (2-3 words) | `title: Image Component`                         |
| `description` | Brief description (1-2 sentences)           | `description: Optimize images using next/image.` |

### Optional Fields

| Field       | Description                                        | Example                                      |
| ----------- | -------------------------------------------------- | -------------------------------------------- |
| `nav_title` | Shorter title for navigation sidebar               | `nav_title: Image`                           |
| `source`    | Pull content from another page (avoid duplication) | `source: app/api-reference/components/image` |
| `related`   | Next steps section with related links              | See below                                    |
| `version`   | Development stage indicator                        | `version: experimental`                      |

### Related Links Format

```yaml
---
title: My Feature
description: Description here.
related:
  title: Next Steps
  description: Learn more about related features.
  links:
    - app/api-reference/components/image
    - app/guides/optimizing/images
---
```

### Version Field Values

- `experimental` - Experimental feature, may change
- `legacy` - Legacy feature, consider alternatives
- `unstable` - Unstable API, not recommended for production
- `RC` - Release candidate

## Code Block Conventions

### Basic Syntax

````
```language filename="path/to/file.ext"
code here
```
````

### Required Attributes

| Attribute   | When to Use                       | Example                   |
| ----------- | --------------------------------- | ------------------------- |
| `filename`  | Always for code examples          | `filename="app/page.tsx"` |
| `switcher`  | When providing TS and JS variants | `switcher`                |
| `highlight` | To highlight specific lines       | `highlight={1,3-5}`       |

### TypeScript/JavaScript Switcher Pattern

Always provide TypeScript first, then JavaScript:

````mdx
```tsx filename="app/page.tsx" switcher
import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'My Page',
}
```

```jsx filename="app/page.js" switcher
export const metadata = {
  title: 'My Page',
}
```
````

### Terminal Commands

Use `bash` language without filename:

````mdx
```bash
npm install next
```
````

### Highlighting Lines

```
highlight={1}        # Single line
highlight={1,3}      # Multiple lines
highlight={1-5}      # Range
highlight={1,3-5,8}  # Combined
```

## MDX Components

### AppOnly / PagesOnly

Use for router-specific content in shared documentation:

```mdx
<AppOnly>

This content only appears in App Router documentation.

</AppOnly>

<PagesOnly>

This content only appears in Pages Router documentation.

</PagesOnly>
```

**Important:** Include blank lines inside the components for proper markdown parsing.

### Image Component

For themed images with light/dark variants:

```mdx
<Image
  alt="Description of the image"
  srcLight="/docs/light/image-name.png"
  srcDark="/docs/dark/image-name.png"
  width={1600}
  height={800}
/>
```

### Notes and Callouts

**Single line:**

```mdx
> **Good to know**: Important information here.
```

**Multi-line:**

```mdx
> **Good to know**:
>
> - First point
> - Second point
> - Third point
```

## Props Tables

Use HTML table wrapper for horizontal scroll on mobile:

```mdx
<div style={{ overflowX: 'auto', width: '100%' }}>

| Prop              | Example             | Type    | Status   |
| ----------------- | ------------------- | ------- | -------- |
| [`src`](#src)     | `src="/image.png"`  | String  | Required |
| [`alt`](#alt)     | `alt="Description"` | String  | Required |
| [`width`](#width) | `width={500}`       | Integer | -        |

</div>
```

### Status Values

- `Required` - Must be provided
- `-` - Optional
- `Deprecated` - Will be removed, use alternative

## Shared Content Pattern

For Pages Router docs that share content with App Router:

**App Router (source):** `docs/01-app/03-api-reference/02-components/image.mdx`

- Contains the full documentation
- Uses `<AppOnly>` and `<PagesOnly>` for router-specific sections

**Pages Router (consumer):** `docs/02-pages/03-api-reference/01-components/image.mdx`

```yaml
---
title: Image Component
description: Optimize images using next/image.
source: app/api-reference/components/image
---
```

The `source` field pulls content from the App Router doc.

## Writing Style

### Voice

- **Guides:** Instructional, use "you" to address users
- **API Reference:** Technical, use imperative verbs ("create", "pass", "return")

### Clarity

- Use plain words over complex alternatives
- Be specific: "the `src` prop" not "this prop"
- Avoid jargon unless explaining it

### Structure

Typical page structure:

1. Brief introduction (what and why)
2. Minimal working example
3. Detailed reference/options
4. Examples for different use cases
5. Related links (via frontmatter)

## File Naming

- Use kebab-case: `generate-metadata.mdx`
- Add numeric prefix for ordering: `01-installation.mdx`
- Index pages: `index.mdx`

## Validation Commands

```bash
pnpm lint              # Full lint check
pnpm prettier-fix      # Fix formatting
pnpm types             # TypeScript check
```
