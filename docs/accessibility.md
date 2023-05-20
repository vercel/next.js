---
description: Learn about the built-in accessibility features of Next.js.
---

# Accessibility

The Next.js team is committed to making Next.js accessible to all developers (and their end-users). By adding accessibility features to Next.js by default, we aim to make the Web more inclusive for everyone.

## Route Announcements
When transitioning between pages rendered on the server (e.g., using the <a href> tag), screen readers and other assistive technologies announce the page title to ensure users understand that the page has changed.

Next.js supports client-side transitions for improved performance using next/link. To ensure that client-side transitions are also announced to assistive technology, Next.js includes a route announcer by default.

The Next.js route announcer looks for the page name to announce by first inspecting document.title, then the <h1> element, and finally the URL pathname. To provide the most accessible user experience, ensure that each page in your application has a unique and descriptive title.

## Linting
  
Next.js provides an integrated ESLint experience out of the box, including custom rules for Next.js. By default, Next.js includes eslint-plugin-jsx-a11y to help catch accessibility issues early. The plugin warns about:

    aria-props: Ensuring proper usage of ARIA attributes.
    aria-proptypes: Checking ARIA attribute values against the expected types.
    aria-unsupported-elements: Identifying unsupported ARIA attributes on certain HTML elements.
    role-has-required-aria-props: Checking for required ARIA attributes based on the specified role.
    role-supports-aria-props: Verifying that specified ARIA attributes are supported by the specified role.

For example, this plugin helps ensure you add alt text to img tags, use correct aria-* attributes, use appropriate role attributes, and more.

## Disabling JavaScript

By default, Next.js prerenders pages to static HTML files. This means that JavaScript is not required to view the HTML markup from the server and is instead used to add interactivity on the client side.

If your application requires JavaScript to be disabled, and only HTML to be used, you can remove all JavaScript from your application using an experimental flag:

```js
// next.config.js
export const config = {
  unstable_runtimeJS: false,
}
```
This configuration allows you to disable JavaScript in your Next.js application and serve only HTML, providing a JavaScript-free experience.

We encourage you to follow these accessibility guidelines and use the provided linting tools to ensure your Next.js application is accessible to all users. For further details and examples on creating accessible user interfaces in Next.js, refer to the Next.js Accessibility Documentation(https://nextjs.org/docs/architecture/accessibility) .

Remember to test and validate the accessibility of your Next.js application using manual and automated accessibility testing tools. By prioritizing accessibility, you can provide a better user experience for all users.  

## Accessibility Resources

- [WebAIM WCAG checklist](https://webaim.org/standards/wcag/checklist)
- [WCAG 2.1 Guidelines](https://www.w3.org/TR/WCAG21/)
- [The A11y Project](https://www.a11yproject.com/)
- Check [color contrast ratios](https://developer.mozilla.org/en-US/docs/Web/Accessibility/Understanding_WCAG/Perceivable/Color_contrast) between foreground and background elements
- Use [`prefers-reduced-motion`](https://web.dev/prefers-reduced-motion/) when working with animations
