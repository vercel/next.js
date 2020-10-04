# CSS Modules Imported by a Dependency

#### Why This Error Occurred

One of your dependencies (`node_modules`) imports a CSS Modules file.

This normally happens when a package's source files are accidentally consumed,
instead of the built package.

#### Possible Ways to Fix It

Reach out to the maintainer and ask for them to publish a compiled version of
their dependency.

Compiled dependencies do not have references to CSS Module files, or any other
files that require bundler-specific integrations.

The dependency should also provide instructions about what CSS needs to be
imported by you, in your application.

---

If this is **first party code**, try
[including said monorepo package in the compilation pipeline](https://github.com/vercel/next.js/tree/canary/examples/with-yarn-workspaces).
