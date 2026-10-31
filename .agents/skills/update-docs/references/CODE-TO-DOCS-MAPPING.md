# Code to Documentation Mapping

Maps Next.js source code directories to their corresponding documentation files.

## Core Mappings

### Components

| Source Path                                      | Documentation Path                                      |
| ------------------------------------------------ | ------------------------------------------------------- |
| `packages/next/src/client/components/image.tsx`  | `docs/01-app/03-api-reference/02-components/image.mdx`  |
| `packages/next/src/client/components/link.tsx`   | `docs/01-app/03-api-reference/02-components/link.mdx`   |
| `packages/next/src/client/components/script.tsx` | `docs/01-app/03-api-reference/02-components/script.mdx` |
| `packages/next/src/client/components/form.tsx`   | `docs/01-app/03-api-reference/02-components/form.mdx`   |

### Functions

| Source Path                                          | Documentation Path                                                |
| ---------------------------------------------------- | ----------------------------------------------------------------- |
| `packages/next/src/server/request/`                  | `docs/01-app/03-api-reference/04-functions/`                      |
| `packages/next/src/server/lib/metadata/`             | `docs/01-app/03-api-reference/04-functions/generate-metadata.mdx` |
| `packages/next/src/client/components/navigation.tsx` | `docs/01-app/03-api-reference/04-functions/use-router.mdx`        |
| `packages/next/src/client/components/navigation.tsx` | `docs/01-app/03-api-reference/04-functions/use-pathname.mdx`      |
| `packages/next/src/client/components/navigation.tsx` | `docs/01-app/03-api-reference/04-functions/use-search-params.mdx` |

### File Conventions

| Source Path                                | Documentation Path                                            |
| ------------------------------------------ | ------------------------------------------------------------- |
| `packages/next/src/build/webpack/loaders/` | `docs/01-app/03-api-reference/03-file-conventions/`           |
| `packages/next/src/server/app-render/`     | `docs/01-app/03-api-reference/03-file-conventions/layout.mdx` |
| `packages/next/src/server/app-render/`     | `docs/01-app/03-api-reference/03-file-conventions/page.mdx`   |

### Configuration

| Source Path                                 | Documentation Path                                          |
| ------------------------------------------- | ----------------------------------------------------------- |
| `packages/next/src/server/config-shared.ts` | `docs/01-app/03-api-reference/05-config/01-next-config-js/` |
| `packages/next/src/server/config.ts`        | `docs/01-app/03-api-reference/05-config/01-next-config-js/` |
| `packages/next/src/build/webpack-config.ts` | `docs/01-app/03-api-reference/05-config/01-next-config-js/` |

### Directives

| Source Path                              | Documentation Path                                          |
| ---------------------------------------- | ----------------------------------------------------------- |
| `packages/next/src/server/use-cache/`    | `docs/01-app/03-api-reference/01-directives/use-cache.mdx`  |
| `packages/next/src/client/use-client.ts` | `docs/01-app/03-api-reference/01-directives/use-client.mdx` |
| `packages/next/src/server/use-server.ts` | `docs/01-app/03-api-reference/01-directives/use-server.mdx` |

### Metadata File Conventions

| Source Path                       | Documentation Path                                                                 |
| --------------------------------- | ---------------------------------------------------------------------------------- |
| `packages/next/src/lib/metadata/` | `docs/01-app/03-api-reference/03-file-conventions/01-metadata/`                    |
| Metadata icons handling           | `docs/01-app/03-api-reference/03-file-conventions/01-metadata/app-icons.mdx`       |
| Open Graph images                 | `docs/01-app/03-api-reference/03-file-conventions/01-metadata/opengraph-image.mdx` |
| Sitemap generation                | `docs/01-app/03-api-reference/03-file-conventions/01-metadata/sitemap.mdx`         |

## Directory Pattern Mappings

### By Feature Area

| Source Directory                       | Documentation Area                            | Notes                  |
| -------------------------------------- | --------------------------------------------- | ---------------------- |
| `packages/next/src/client/`            | `docs/01-app/03-api-reference/02-components/` | Client-side components |
| `packages/next/src/server/`            | `docs/01-app/03-api-reference/04-functions/`  | Server functions       |
| `packages/next/src/build/`             | `docs/01-app/03-api-reference/05-config/`     | Build configuration    |
| `packages/next/src/shared/lib/router/` | `docs/01-app/02-guides/`                      | Routing guides         |
| `packages/next/src/lib/metadata/`      | `docs/01-app/02-guides/metadata/`             | Metadata guides        |

### CLI Commands

| Source Path                           | Documentation Path                                   |
| ------------------------------------- | ---------------------------------------------------- |
| `packages/next/src/cli/next-dev.ts`   | `docs/01-app/03-api-reference/06-cli/next-dev.mdx`   |
| `packages/next/src/cli/next-build.ts` | `docs/01-app/03-api-reference/06-cli/next-build.mdx` |
| `packages/next/src/cli/next-start.ts` | `docs/01-app/03-api-reference/06-cli/next-start.mdx` |

## Finding Related Documentation

### Step 1: Identify the changed export

Look at what's exported from the changed file:

- Public API exports → API Reference docs
- Internal utilities → Usually no docs needed
- Configuration types → Config docs

### Step 2: Search for existing docs

Use Claude's built-in tools for searching:

- **Find docs mentioning a term**: Use the Grep tool with the pattern and `docs/` as the path
- **List docs in a directory**: Use the Glob tool with pattern like `docs/01-app/03-api-reference/04-functions/*.mdx`

### Step 3: Check for shared content

If editing App Router docs, check if Pages Router has a corresponding file with `source` field:

- **Find source references**: Use the Grep tool with pattern `source: app/api-reference` in `docs/02-pages/`

## Common Patterns

### New API Function

1. Export added to `packages/next/src/server/`
2. Create doc at `docs/01-app/03-api-reference/04-functions/function-name.mdx`
3. Update index/listing pages if applicable

### New Component Prop

1. Prop added to component in `packages/next/src/client/components/`
2. Update the props table in corresponding doc
3. Add a section explaining the new prop with examples

### New Config Option

1. Option added to `packages/next/src/server/config-shared.ts`
2. Find the relevant config doc in `docs/01-app/03-api-reference/05-config/01-next-config-js/`
3. Add the option with description and example

### Behavioral Change

1. Logic changed in any source file
2. Find all docs that describe this behavior
3. Update descriptions and examples to match new behavior
4. Add migration notes if breaking change

## Quick Search Commands

Use Claude's built-in tools for efficient searching:

- **Find all docs mentioning a term**: Use the Grep tool with your search pattern and `docs/` as the path, filtering to `*.mdx` files
- **List all API reference docs**: Use the Glob tool with pattern `docs/01-app/03-api-reference/**/*.mdx`
- **Find docs by filename pattern**: Use the Glob tool with pattern like `docs/**/*image*.mdx`
- **Read a doc's frontmatter**: Use the Read tool with a line limit to check the `source` field
