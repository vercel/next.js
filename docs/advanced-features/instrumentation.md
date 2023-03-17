---
description: Learn how to instrument your Next.js app.
---

> **Note**: This feature is experimental, you need to explicitly opt-in by providing `experimental.instrumentationHook = true;` in your `next.config.js`.

# `instrumentation.ts`

If you export a function named `register` from this file, we will call that function whenever new server instance is bootstrapped.
When deployed it will be called continuously on each coldboot (but exactly once in each environment).

Many people used imports with side-effects before we released this feature.
The behavior is similar, but using imports with side-effects is hard to work with and has many down-sides.

So instead of adding `import 'package-with-side-effect'`, you can add this:

```ts
// instrumentation.ts

import {init} from 'package-init'

export const register() {
  init()
}
```

If your package requires you to use import side-effect, you can do this instead:

```ts
// instrumentation.ts

export const register() {
  require('package-with-side-effect')
}
```

By doing this, you can have all your side-effects in one place and you can be sure that importing your files won't have unintended consequences.
