---
description: Learn how to instrument your Next.js app.
---

> **Note**: This feature is experimental. To use it, you must explicitly opt in by defining `experimental.instrumentationHook = true;` in your `next.config.js`.

# `instrumentation.ts`

If you export a function named `register` from this file, we will call that function whenever new server instance is bootstrapped.
When your `register` function is deployed, it will be called continuously on each cold boot (but exactly once in each environment).

Sometimes, it may be useful to import a file in your code because of the side effects it will cause. For example, you might import a file that defines a set of global variables, but never explicitly use the imported file in your code. You would still have access to the global variables the package has declared.

The behavior is similar, but using imports with side-effects is hard to work with and has many downsides.

**We recommend importing the `init` function from `package-init` instead of importing packages with side effects**. You can then call it from your custom `register` function defined in `instrumentation.ts`, as demonstrated in the example below:

```ts
// instrumentation.ts

import { init } from 'package-init'

export const register() {
  init()
}
```

If you need to import a package strictly for its side effects, we recommend using `require` in your custom `register` function instead. The following example demonstrates a basic usage of `require` in a `register` function:

```ts
// instrumentation.ts

export const register() {
  require('package-with-side-effect')
}
```

By doing this, you can have all your side-effects in one place and you can be sure that importing your files won't have unintended consequences.
