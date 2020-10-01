---
description: Extend the PostCSS config and plugins added by Next.js with your own.
---

# Customizing PostCSS Config

<details open>
  <summary><b>Examples</b></summary>
  <ul>
    <li><a href="https://github.com/vercel/next.js/tree/canary/examples/with-tailwindcss">Tailwind CSS Example</a></li>
  </ul>
</details>

## Default Behavior

Next.js compiles CSS for its [built-in CSS support](/docs/basic-features/built-in-css-support.md) using PostCSS.

Out of the box, with no configuration, Next.js compiles CSS with the following transformations:

1. [Autoprefixer](https://github.com/postcss/autoprefixer) automatically adds vendor prefixes to CSS rules (back to IE11).
1. [Cross-browser Flexbox bugs](https://github.com/philipwalton/flexbugs) are corrected to behave like [the spec](https://www.w3.org/TR/css-flexbox-1/).
1. New CSS features are automatically compiled for Internet Explorer 11 compatibility:
   - [`all` Property](https://developer.mozilla.org/en-US/docs/Web/CSS/all)
   - [Break Properties](https://developer.mozilla.org/en-US/docs/Web/CSS/break-after)
   - [`font-variant` Property](https://developer.mozilla.org/en-US/docs/Web/CSS/font-variant)
   - [Gap Properties](https://developer.mozilla.org/en-US/docs/Web/CSS/gap)
   - [Media Query Ranges](https://developer.mozilla.org/en-US/docs/Web/CSS/Media_Queries/Using_media_queries#Syntax_improvements_in_Level_4)

By default, [CSS Grid](https://www.w3.org/TR/css-grid-1/) and [Custom Properties](https://developer.mozilla.org/en-US/docs/Web/CSS/var) (CSS variables) are **not compiled** for IE11 support.

To compile [CSS Grid Layout](https://developer.mozilla.org/en-US/docs/Web/CSS/grid) for IE11, you can place the following comment at the top of your CSS file:

```css
/* autoprefixer grid: autoplace */
```

You can also enable IE11 support for [CSS Grid Layout](https://developer.mozilla.org/en-US/docs/Web/CSS/grid)
in your entire project by configuring autoprefixer with the configuration shown below (collapsed).
See ["Customizing Plugins"](#customizing-plugins) below for more information.

<details>
<summary><strong>Click to view the configuration to enable CSS Grid Layout</strong></summary>

```json
{
  "plugins": [
    "postcss-flexbugs-fixes",
    [
      "postcss-preset-env",
      {
        "autoprefixer": {
          "flexbox": "no-2009",
          "grid": "autoplace"
        },
        "stage": 3,
        "features": {
          "custom-properties": false
        }
      }
    ]
  ]
}
```

</details>
<br/>

CSS variables are not compiled because it is [not possible to safely do so](https://github.com/MadLittleMods/postcss-css-variables#caveats).
If you must use variables, consider using something like [Sass variables](https://sass-lang.com/documentation/variables) which are compiled away by [Sass](https://sass-lang.com/).

## Customizing Target Browsers

Next.js allows you to configure the target browsers (for [Autoprefixer](https://github.com/postcss/autoprefixer) and compiled css features) through [Browserslist](https://github.com/browserslist/browserslist).

To customize browserslist, create a `browserslist` key in your `package.json` like so:

```json
{
  "browserslist": [">0.3%", "not ie 11", "not dead", "not op_mini all"]
}
```

You can use the [browserl.ist](https://browserl.ist/?q=%3E0.3%25%2C+not+ie+11%2C+not+dead%2C+not+op_mini+all) tool to visualize what browsers you are targeting.

## CSS Modules

No configuration is needed to support CSS Modules. To enable CSS Modules for a file, rename the file to have the extension `.module.css`.

You can learn more about [Next.js' CSS Module support here](/docs/basic-features/built-in-css-support.md).

## Customizing Plugins

> **Warning**: When you define a custom PostCSS configuration file, Next.js **completely disables** the [default behavior](#default-behavior).
> Be sure to manually configure all the features you need compiled, including [Autoprefixer](https://github.com/postcss/autoprefixer).
> You also need to install any plugins included in your custom configuration manually, i.e. `npm install postcss-flexbugs-fixes postcss-preset-env`.

To customize the PostCSS configuration, create a `postcss.config.json` file in the root of your project.

This is the default configuration used by Next.js:

```json
{
  "plugins": [
    "postcss-flexbugs-fixes",
    [
      "postcss-preset-env",
      {
        "autoprefixer": {
          "flexbox": "no-2009"
        },
        "stage": 3,
        "features": {
          "custom-properties": false
        }
      }
    ]
  ]
}
```

> **Note**: Next.js also allows the file to be named `.postcssrc.json`, or, to be read from the `postcss` key in `package.json`.

It is also possible to configure PostCSS with a `postcss.config.js` file, which is useful when you want to conditionally include plugins based on environment:

```js
module.exports = {
  plugins:
    process.env.NODE_ENV === 'production'
      ? [
          'postcss-flexbugs-fixes',
          [
            'postcss-preset-env',
            {
              autoprefixer: {
                flexbox: 'no-2009',
              },
              stage: 3,
              features: {
                'custom-properties': false,
              },
            },
          ],
        ]
      : [
          // No transformations in development
        ],
}
```

> **Note**: Next.js also allows the file to be named `.postcssrc.js`.

Do **not use `require()`** to import the PostCSS Plugins. Plugins must be provided as strings.

> **Note**: If your `postcss.config.js` needs to support other non-Next.js tools in the same project, you must use the interoperable object-based format instead:
>
> ```js
> module.exports = {
>   plugins: {
>     'postcss-flexbugs-fixes': {},
>     'postcss-preset-env': {
>       autoprefixer: {
>         flexbox: 'no-2009',
>       },
>       stage: 3,
>       features: {
>         'custom-properties': false,
>       },
>     },
>   },
> }
> ```
