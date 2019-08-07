# `next-head-count` is missing

#### Why This Error Occurred

Custom `_document.js` require certain components from `next/document` to be rendered and `<Head>` was missing.

#### Possible Ways to Fix It

Ensure that your `_document.js` is importing and rendering all of the [required components](https://nextjs.org/docs#custom-document).
