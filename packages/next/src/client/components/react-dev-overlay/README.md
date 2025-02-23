# Dev Overlay

## Project Structure

- `app/` - This directory contains the main entrypoint of the dev overlay for the App Router and it's related source files.
- `font/` - Includes Geist fonts that will be served to the client via the internal `/__nextjs_font/...` route.
- `pages/` - This directory contains the main entrypoint of the dev overlay for the Pages Router and it's related source files.
- `server/` - This directory contains the source files that are related to the dev overlay, but are to run on the server and not sent to the client.
- `ui/` - This directory contains the main UI components that are used to build the dev overlay. It is recommended to keep this directory isolated from the rest of the codebase to make it easier to be excluded from compiliation and be bundled in the future.
- `utils/` - Utils are utils, but unlike the ones inside the `ui/` directory, they can also be used outside of this project.

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

Use CSS inside a template literals of the components. It is recommended to have the styles together with the component to make it easier to maintain. The class names are recommended to be used, ensure they're unique within the dev overlay to avoid conflicts.

```tsx
export function Component() {
  return (
    <div data-nextjs-some-component>
      <h1>Hello, Next.js!</h1>
    </div>
  )
}

export const COMPONENT_NAME_STYLES = `
  [data-nextjs-some-component] {
    background-color: red;
  }
`
```

The exported `COMPONENT_NAME_STYLES` can be used in the entrypoint (i.e., `ComponentStyles`) of the dev overlay to inject into the `<style>` tag.

```tsx
import { COMPONENT_NAME_STYLES } from './component'

export function ComponentStyles() {
  return (
    <style>
      {css`
        // ...
        ${COMPONENT_NAME_STYLES}
      `}
    </style>
  )
}
```

> [!NOTE]
> The entry points of the dev overlay (which are using the `<style>` tag) should use the `css` util that minifies and removes the comments from the styles.
