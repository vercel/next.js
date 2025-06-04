# turbopack-ecmascript-runtime

This crate contains Turbopack's ECMAScript runtimes. These include:

- Development runtimes for the browser, Node.js, and Edge-like runtimes;
- Production runtimes for the browser, Node.js, and Edge-like runtimes (only Node.js is implemented for now).

## `<reference path="...">`

The TypeScript files corresponding to the runtime itself all use `<reference path="...">` instead of `import`/`export`
to import dependencies. This is because the runtime doesn't use a module system. Instead, the files are concatenated
together in a specific order.

As such, the `<reference path="...">` statements more closely map to the way the runtime is actually built. They also
allow us to refer to top-level declarations in another file without having to `import`/`export` them, which makes no
sense in the context of a runtime.

## Why is everything in one crate?

The runtime-agnostic code (`js/src/shared`) was originally placed in `turbopack-ecmascript`, and the runtime-specific
code (`js/src/{build,dev}`) in `turbopack-{build,dev}`.

However, `<reference path="...">` statements only support relative paths. You can't refer to a file in a dependency. For
the typings to work properly, and for them to be usable from outside of this repo (e.g. in the Next.js repo), it's much
easier to have everything in one package.

## Why so many `tsconfig.json`?

Since different runtimes are meant to run in different environments, they use different `tsconfig.json` files to
customize what APIs are available to them. For example, the browser runtime can use `window` and `document`, but the
Node.js runtime can't.

All of these `tsconfig.json` files extend `tsconfig.base.json`, which contains the common configuration for all
runtimes.
