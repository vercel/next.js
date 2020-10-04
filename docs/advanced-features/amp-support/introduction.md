---
description: With minimal config, and without leaving React, you can start adding AMP and improve the performance and speed of your pages.
---

# AMP Support

<details>
  <summary><b>Examples</b></summary>
  <ul>
    <li><a href="https://github.com/vercel/next.js/tree/canary/examples/amp">AMP</a></li>
  </ul>
</details>

With Next.js you can turn any React page into an AMP page, with minimal config, and without leaving React.

You can read more about AMP in the official [amp.dev](https://amp.dev/) site.

## Enabling AMP

To enable AMP support for a page, and to learn more about the different AMP configs, read the [API documentation for `next/amp`](/docs/api-reference/next/amp.md).

## Caveats

- Only CSS-in-JS is supported. [CSS Modules](/docs/basic-features/built-in-css-support.md) aren't supported by AMP pages at the moment. You can [contribute CSS Modules support to Next.js](https://github.com/vercel/next.js/issues/10549).

## Related

For more information on what to do next, we recommend the following sections:

<div class="card">
  <a href="/docs/advanced-features/amp-support/adding-amp-components.md">
    <b>AMP Components:</b>
    <small>Make your pages more interactive with AMP components.</small>
  </a>
</div>

<div class="card">
  <a href="/docs/advanced-features/amp-support/amp-validation.md">
    <b>AMP Validation:</b>
    <small>Learn about how Next.js validates AMP pages.</small>
  </a>
</div>
