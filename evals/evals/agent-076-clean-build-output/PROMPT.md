Our release pipeline treats any warning in the production build log as a
release blocker (it scans the output of our `build` script). Every deploy is
currently stuck on this block, which shows up in every `next build`:

```
Turbopack build encountered 1 warning:
./vendor/telemetry-client/index.cjs:18:12
Warning: Module not found: Can't resolve 'fast-telemetry-' <dynamic no slash>
  16 |   try {
  17 |     // Optional dependency: resolved by name at runtime when installed.
> 18 |     return require('fast-telemetry-' + backend)
     |            ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
  19 |   } catch (err) {
  20 |     return null
  21 |   }
```

The app itself is fine. `vendor/telemetry-client/` is licensed third-party
code that we vendor byte-for-byte — per the license we may not modify it, and
we don't want it forked, wrapped, or replaced either: it must keep loading
exactly the way it does today. The optional native accelerator it probes for
isn't installed anywhere we deploy; its built-in in-memory fallback is exactly
what we run in production (the diagnostics footer on the home page shows the
active transport, and it should keep showing the fallback one).

Make the production build clean: `next build` must finish successfully with
zero warnings in its output, and everything must keep working. Two hard
constraints from our side: we stay on the default bundler, and the `build`
script in `package.json` stays exactly `next build` — the pipeline invokes it
verbatim, so no wrapper scripts around the build.
