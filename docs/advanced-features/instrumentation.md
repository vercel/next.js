---
description: Learn how to instrument your Next.js app.
---

> **Note**: This feature is experimental. To use it, you must explicitly opt in by defining `experimental.instrumentationHook = true;` in your `next.config.js`.

# `instrumentation.ts`

If you export a function named `register` from this file, we will call that function whenever a new server instance is bootstrapped.
When your `register` function is deployed, it will be called continuously on each cold boot (but exactly once in each environment).

Sometimes, it may be useful to import a file in your code because of the side effects it will cause. For example, you might import a file that defines a set of global variables, but never explicitly use the imported file in your code. You would still have access to the global variables the package has declared.

**We recommend importing the `init` function from `package-init` instead of importing packages with side effects**. You can then call it from your custom `register` function defined in `instrumentation.ts`, as demonstrated in the example below:

```ts
// instrumentation.ts

import { init } from 'package-init'

export const register() {
  init()
}
```

However, we recommend importing files with side effects using `require` from within your `register` function instead. The following example demonstrates a basic usage of `require` in a `register` function:

```ts
// instrumentation.ts

export const register() {
  require('package-with-side-effect')
}
```

By doing this, you can colocate all of your side effects in one place in your code, and avoid any unintended consequences from importing files.
