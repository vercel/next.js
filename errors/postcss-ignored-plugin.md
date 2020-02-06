# Ignored PostCSS Plugin

#### Why This Error Occurred

The project's custom PostCSS configuration attempts to configure unnecessary plugins:

- postcss-modules-values
- postcss-modules-scope
- postcss-modules-extract-imports
- postcss-modules-local-by-default
- postcss-modules

#### Possible Ways to Fix It

Remove the plugin specified in the error message from your custom PostCSS configuration.

#### How do I configure CSS Modules?

CSS Modules are supported in [Next.js' built-in CSS support](https://nextjs.org/docs/advanced-features/customizing-postcss-config).
You can [read more](https://nextjs.org/docs/advanced-features/customizing-postcss-config) about how to use them [here](https://nextjs.org/docs/advanced-features/customizing-postcss-config).
