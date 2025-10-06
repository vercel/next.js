# Dev Overlay

## Project Structure

- `next-devtools/dev-overlay/` - The UI that Next.js developers can interact with in development.
- `next-devtools/server/` - Code that runs in the Next.js development server.
- `next-devtools/shared/` - Anything that doesn't fit in
- `next-devtools/userspace/` - Code that runs in the user's application.

Modules in `dev-overlay/` are isolated from the rest of the source. Any stateful module will not share state with e.g. `userspace/`. Stateful modules in `shared/` cannot be used to pass data from `dev-overlay/` to `userspace/` or vice versa.

`userspace/` code can send messages to `dev-overlay/` via the `dispatcher` imported from `next/dist/compiled/next-devtools`.

Keep processing in `userspace/` to a minimum and prefer deriving data in `dev-overlay/`.

## Development

The dev overlay leverages [Shadow DOM](https://developer.mozilla.org/en-US/docs/Web/API/Web_components/Using_shadow_DOM) to insert the dev overlay into the client without affecting the user's application through encapsulation from CSS.

### Local Development

Next.js uses [Storybook](https://storybook.js.org) to develop UI components in the dev overlay.

To run the dev overlay locally, you can run the following command:

```bash
pnpm storybook
```

This will start the Storybook server at `http://localhost:6006`.

### Styling

Next.js direcly injects CSS into the DOM via `<style>` tag. The styles will not affect the user's application as the [styles are encapsulated](https://developer.mozilla.org/en-US/docs/Web/API/Web_components/Using_shadow_DOM#encapsulation_from_css) from the rest of the application.

> [!TIP]
> While Shadow DOM provides style encapsulation, the root element (i.e., `<nextjs-portal>`) can still inherit styles from parent elements like `<body>` or `<html>`. Direct styling on these parent elements (e.g., `body { contain: layout; }`) will affect the dev overlay.

Write CSS in template literals alongside your components. It is recommended to use the class names that are unique within the dev overlay to avoid conflicts. You can use `data-nextjs-` data attributes to target the elements in the dev overlay.

```tsx
export function Component() {
  return (
    <div className="some-unique-class-name">
      <h1>Hello, Next.js!</h1>
    </div>
  )
}

export const COMPONENT_NAME_STYLES = `
  .some-unique-class-name {
    background-color: red;
  }
`
```

> [!IMPORTANT]
> Use the `css()` util that minifies and removes the comments before injecting to the `<style>` tag.

The exported `COMPONENT_NAME_STYLES` can be used in the styles entrypoint (i.e., `ComponentStyles`) of the dev overlay to inject into the `<style>` tag.

```tsx
import { COMPONENT_NAME_STYLES } from './component'

export function ComponentStyles() {
  return (
    <style>
      {css`
        // ...
        ${COMPONENT_NAME_STYLES}
      `}
    </style
  )
}
```

### Dark Theme

The dev overlay implements a dark theme automatically by system preferences. Users can manually toggle between light and dark themes via the DevTools Indicator preferences panel.

To make changes to the dark theme, you can edit the [`ui/styles/dark-theme.tsx`](./ui/styles/dark-theme.tsx) file.
