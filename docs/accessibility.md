---
description: Learn about the built-in accessibility features of Next.js.
---

# Accessibility

The Next.js team is committed to making Next.js accessible to all developers (and their end-users). By adding accessibility features to Next.js by default, we aim to make the Web more inclusive for everyone.

## Route Announcements

When using screen readers or other assistive technology, routes are announced when navigating between pages. This works by default when transitioning between pages on the server (e.g. using the `<a>` tag).

Next.js also supports client-side transitions for improved performance (using `next/link`). To ensure that client-side transitions are also announced to assistive technology, Next.js includes a route announcer by default.

The Next.js route announcer looks for the page name to announce by first inspecting `document.title`, then the `<h1>` element, and finally the URL pathname.

## Linting

Next.js provides an [integrated ESLint experience](/docs/basic-features/eslint.md) out of the box, including custom rules for Next.js. By default, Next.js includes `eslint-plugin-jsx-a11y` to help catch accessibility issues early, including warning on:

- [aria-props](https://github.com/jsx-eslint/eslint-plugin-jsx-a11y/blob/HEAD/docs/rules/aria-props.md?rgh-link-date=2021-06-04T02%3A10%3A36Z)
- [aria-proptypes](https://github.com/jsx-eslint/eslint-plugin-jsx-a11y/blob/HEAD/docs/rules/aria-proptypes.md?rgh-link-date=2021-06-04T02%3A10%3A36Z)
- [aria-unsupported-elements](https://github.com/jsx-eslint/eslint-plugin-jsx-a11y/blob/HEAD/docs/rules/aria-unsupported-elements.md?rgh-link-date=2021-06-04T02%3A10%3A36Z)
- [role-has-required-aria-props](https://github.com/jsx-eslint/eslint-plugin-jsx-a11y/blob/HEAD/docs/rules/role-has-required-aria-props.md?rgh-link-date=2021-06-04T02%3A10%3A36Z)
- [role-supports-aria-props](https://github.com/jsx-eslint/eslint-plugin-jsx-a11y/blob/HEAD/docs/rules/role-supports-aria-props.md?rgh-link-date=2021-06-04T02%3A10%3A36Z)

For example, this plugin helps ensure you add alt text to `img` tags, use correct `aria-*` attributes, use correct `role` attributes, and more.

## Disabling JavaScript

By default, Next.js prerenders pages to static HTML files. This means that JavaScript is not required to view the HTML markup from the server and is instead used to add interactivity on the client side.

If your application requires JavaScript to be disabled, and only HTML to be used, you can remove all JavaScript from your application using an experimental flag:

```js
// next.config.js
export const config = {
  unstable_runtimeJS: false,
}
```

## Accessibility Resources

- Check [color contrast ratios](https://developer.mozilla.org/en-US/docs/Web/Accessibility/Understanding_WCAG/Perceivable/Color_contrast) between foreground and background elements
- Use [`prefers-reduced-motion`](https://web.dev/prefers-reduced-motion/) when working with animations
- TODO add more pls
