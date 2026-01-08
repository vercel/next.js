# Cache Components Plugin for Claude Code

Expert guidance for Next.js Cache Components and Partial Prerendering (PPR).

## Features

This plugin provides a comprehensive skill that:

- **Proactively activates** in projects with `cacheComponents: true`
- Teaches the `'use cache'` directive, `cacheLife()`, `cacheTag()`, and invalidation APIs
- Explains **parameter permutation rendering** and subshell generation
- Covers migration from deprecated `revalidate`/`dynamic` segment configs
- Provides build-time error solutions and debugging guidance

## Installation

### Step 1: Add the Next.js Marketplace

```
/plugin marketplace add vercel/next.js
```

### Step 2: Install the Plugin

```
/plugin install cache-components@nextjs
```

Or install via CLI:

```bash
claude plugin install cache-components@nextjs
```

### Step 3 (Optional): Enable for Your Team

Add to your project's `.claude/settings.json` to auto-enable for all team members:

```json
{
  "enabledPlugins": {
    "cache-components@nextjs": true
  }
}
```

## What's Included

| File | Description |
|------|-------------|
| `SKILL.md` | Core concepts, APIs, and proactive application guidelines |
| `REFERENCE.md` | Complete API reference, generateStaticParams, deprecated configs |
| `PATTERNS.md` | 12 production patterns including subshell composition |
| `TROUBLESHOOTING.md` | Build errors, debugging techniques, common issues |

## Usage

Once installed, the skill automatically activates when:

1. You're working in a Next.js project with `cacheComponents: true`
2. You ask about caching, PPR, or the `'use cache'` directive
3. You're writing React Server Components or Server Actions

### Example Triggers

- "How do I cache this data fetching function?"
- "What's the difference between updateTag and revalidateTag?"
- "I'm getting a build error about uncached data outside Suspense"
- "Help me set up generateStaticParams for my product pages"

## Key Concepts Covered

### Parameter Permutation Rendering

When you provide `generateStaticParams`, Next.js renders ALL permutations:

```
generateStaticParams returns:
  [{ category: 'jackets', slug: 'bomber' }]

Next.js renders:
  /products/jackets/bomber     ← Complete page
  /products/jackets/[slug]     ← Category subshell (reusable!)
  /products/[category]/[slug]  ← Fallback shell
```

### Deprecated Segment Configs

| Old (Deprecated) | New (Cache Components) |
|------------------|------------------------|
| `export const revalidate = 3600` | `cacheLife('hours')` inside `'use cache'` |
| `export const dynamic = 'force-static'` | Use `'use cache'` + Suspense |

## Contributing

This plugin lives in the Next.js repository at `.claude-plugin/plugins/cache-components/`.

To contribute improvements:

1. Edit files in `.claude-plugin/plugins/cache-components/skills/cache-components/`
2. Test locally with `claude --plugin-dir .claude-plugin/plugins/cache-components`
3. Submit a PR to the Next.js repository

## Version History

### 1.0.0

- Initial release
- Covers `'use cache'`, `cacheLife()`, `cacheTag()`, `updateTag()`, `revalidateTag()`
- Parameter permutation rendering and subshell generation
- Migration guide from deprecated segment configs
- Build-time feedback and troubleshooting
