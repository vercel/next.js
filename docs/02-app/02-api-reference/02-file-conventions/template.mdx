---
title: template.js
description: API Reference for the template.js file.
---

A **template** file is similar to a [layout](/docs/app/building-your-application/routing/pages-and-layouts#layouts) in that it wraps each child layout or page. Unlike layouts that persist across routes and maintain state, templates create a new instance for each of their children on navigation.

```tsx filename="app/template.tsx" switcher
export default function Template({ children }: { children: React.ReactNode }) {
  return <div>{children}</div>
}
```

```jsx filename="app/template.jsx" switcher
export default function Template({ children }) {
  return <div>{children}</div>
}
```

<Image
  alt="template.js special file"
  srcLight="/docs/light/template-special-file.png"
  srcDark="/docs/dark/template-special-file.png"
  width="1600"
  height="444"
/>

While less common, you might choose a template over a layout if you want:

- Features that rely on `useEffect` (e.g logging page views) and `useState` (e.g a per-page feedback form).
- To change the default framework behavior. For example, Suspense Boundaries inside layouts only show the fallback the first time the Layout is loaded and not when switching pages. For templates, the fallback is shown on each navigation.

## Props

### `children` (required)

Template components should accept and use a `children` prop. `template` is rendered between a [layout](/docs/app/api-reference/file-conventions/layout) and its children. For example:

```jsx filename="Output"
<Layout>
  {/* Note that the template is given a unique key. */}
  <Template key={routeParam}>{children}</Template>
</Layout>
```

> **Good to know**:
>
> - By default, `template` is a [Server Component](/docs/app/building-your-application/rendering/server-components), but can also be used as a [Client Component](/docs/app/building-your-application/rendering/client-components) through the `"use client"` directive.
> - When a user navigates between routes that share a `template`, a new instance of the component is mounted, DOM elements are recreated, state is **not** preserved, and effects are re-synchronized.

## Version History

| Version   | Changes                |
| --------- | ---------------------- |
| `v13.0.0` | `template` introduced. |
