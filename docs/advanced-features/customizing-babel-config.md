# Customizing Babel Config

<details>
  <summary><b>Examples</b></summary>
  <ul>
    <li><a href="https://github.com/zeit/next.js/tree/canary/examples/with-custom-babel-config">Customizing babel configuration</a></li>
  </ul>
</details>

Next.js includes the `next/babel` preset to your app, it includes everything needed to compile React applications and server-side code. But if you want to extend the default Babel configs, it's also possible.

To start, you only need to define a `.babelrc` file at the top of your app, if such file is found, we're going to consider it the _source of truth_, therefore it needs to define what Next.js needs as well, which is the `next/babel` preset.

Here's an example `.babelrc` file:

```json
{
  "presets": ["next/babel"],
  "plugins": []
}
```

The `next/babel` presets includes:

- preset-env
- preset-react
- preset-typescript
- plugin-proposal-class-properties
- plugin-proposal-object-rest-spread
- plugin-transform-runtime
- styled-jsx

These presets/plugins **should not** be added to your custom `.babelrc`. Instead, you can configure them on the `next/babel` preset, like so:

```json
{
  "presets": [
    [
      "next/babel",
      {
        "preset-env": {},
        "transform-runtime": {},
        "styled-jsx": {},
        "class-properties": {}
      }
    ]
  ],
  "plugins": []
}
```

To learn more about the available options for each config, visit their documentation site.

> Next.js uses the **current** Node.js version for server-side compilations.

> The `modules` option on `"preset-env"` should be kept to `false`, otherwise webpack code splitting is disabled.
