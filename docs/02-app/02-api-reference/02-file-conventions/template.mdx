---
title: template.js
description: API Reference for the template.js file.
---

A **template** file is similar to a [layout](/docs/app/building-your-application/routing/layouts-and-templates#layouts) in that it wraps a layout or page. Unlike layouts that persist across routes and maintain state, templates are given a unique key, meaning children Client Components reset their state on navigation.

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

While less common, you might choose to use a template over a layout if you want:

- Features that rely on `useEffect` (e.g logging page views) and `useState` (e.g a per-page feedback form).
- To change the default framework behavior. For example, Suspense Boundaries inside layouts only show the fallback the first time the Layout is loaded and not when switching pages. For templates, the fallback is shown on each navigation.

## Props

### `children` (required)

Template accepts a `children` prop. For example:

```jsx filename="Output"
<Layout>
  {/* Note that the template is automatically given a unique key. */}
  <Template key={routeParam}>{children}</Template>
</Layout>
```

> **Good to know**:
>
> - By default, `template` is a [Server Component](/docs/app/building-your-application/rendering/server-components), but can also be used as a [Client Component](/docs/app/building-your-application/rendering/client-components) through the `"use client"` directive.
> - When a user navigates between routes that share a `template`, a new instance of the component is mounted, DOM elements are recreated, state is **not** preserved in Client Components, and effects are re-synchronized.

## Version History

| Version   | Changes                |
| --------- | ---------------------- |
| `v13.0.0` | `template` introduced. |
