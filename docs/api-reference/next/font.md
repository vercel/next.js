---
description: Optimizing loading web fonts with the built-in `@next/font` loaders.
---

# @next/font

<details>
  <summary><b>Version History</b></summary>

| Version   | Changes                 |
| --------- | ----------------------- |
| `v13.0.0` | `@next/font` was added. |

</details>

This API reference will help you understand how to use [`@next/font/google`](#nextfontgoogle) and [`@next/font/local`](#nextfontlocal). For features and usage, please see the [Optimizing Fonts](/docs/optimizing/fonts.md) page.

## @next/font/google

| Key                                         | Example                            | Data type                                                 | Required                                         |
| ------------------------------------------- | ---------------------------------- | --------------------------------------------------------- | ------------------------------------------------ |
| [`weight`](#weight)                         | `weight: '600'`                    | String                                                    | Required if font is not variable                 |
| [`style`](#style)                           | `style: 'italic'`                  | String                                                    | Optional                                         |
| [`axes`](#axes)                             | `axes: ['slnt']`                   | Array of Strings based on the available axes for the font | Optional for variable fonts that have extra axes |
| [`display`](#display)                       | `display: 'swap'`                  | String                                                    | Optional                                         |
| [`preload`](#preload)                       | `preload: false`                   | Boolean                                                   | Optional                                         |
| [`fallback`](#fallback)                     | `fallback: ['system-ui', 'arial']` | Array of Strings                                          | Optional                                         |
| [`adjustFontFallback`](#adjustFontFallback) | `adjustFontFallback: false`        | ['Arial', 'Times New Roman', false]                       | Optional                                         |
| [`variable`](#variable)                     | `variable: '--my-font'`            | String                                                    | Optional                                         |

### `weight`

**Required** if the font being used is **not** [variable](https://fonts.google.com/variablefonts). The `weight` (string) for the given font. For example, `'100'`.

### `style`

The [`font-style`](https://developer.mozilla.org/en-US/docs/Web/CSS/font-style) with possible string [values](https://developer.mozilla.org/en-US/docs/Web/CSS/font-style#values) of `'normal'`, `'italic'` or `'oblique'` with default value of `'normal'`.

### `axes`

Some variable fonts have extra `axes` that can be included. By default, only the font weight is included to keep the file size down. The possible values of `axes` depend on the specific font.

For example, the `Inter` variable font has `slnt` as additional `axes` as shown [here](https://fonts.google.com/variablefonts?vfquery=inter#font-families). You can find the possible `axes` values for your font by using the filter on the [Google variable fonts page](https://fonts.google.com/variablefonts#font-families) and looking for axes other than `wght`.

### `display`

The [`font-display`](https://developer.mozilla.org/en-US/docs/Web/CSS/@font-face/font-display) with possible string [values](https://developer.mozilla.org/en-US/docs/Web/CSS/@font-face/font-display#values) of `'auto'`, `'block'`, `'swap'`, `'fallback'` or `'optional'` with default value of `'optional'`.

### `preload`

Default to `true`. Whether the font file should be preloaded or not.

### `fallback`

The fallback font to use if the font cannot be loaded. The possible string values are `'system-ui'` or `'arial'` with no default.

### `adjustFontFallback`

A string or boolean `false` value that sets whether an automatic fallback font should be used to reduce [Cumulative Layout Shift (CLS)](https://nextjs.org/learn/seo/web-performance/cls). The possible values are `'Arial'`, `'Times New Roman'` or `false`. The default is `'Arial'`.

### `variable`

A string value to define the CSS variable name to be used if the style is applied with the [CSS variable method](#css-variables).

## @next/font/local

| Key                                         | Example                                                     | Data type                              | Required |
| ------------------------------------------- | ----------------------------------------------------------- | -------------------------------------- | -------- |
| [`src`](#src)                               | `src: './my-font.woff2'`                                    | String                                 | Required |
| [`weight`](#weight)                         | `weight: "600"`                                             | String                                 | Optional |
| [`style`](#style)                           | `style: "italic"`                                           | String                                 | Optional |
| [`display`](#display)                       | `display: "swap"`                                           | String                                 | Optional |
| [`preload`](#preload)                       | `preload: false`                                            | Boolean                                | Optional |
| [`fallback`](#fallback)                     | `fallback: ["system-ui", "arial"]`                          | Array of Strings                       | Optional |
| [`adjustFontFallback`](#adjustFontFallback) | `adjustFontFallback: false`                                 | ['Arial', 'Times New Roman', false]    | Optional |
| [`variable`](#variable)                     | `variable: "--my-font"`                                     | String                                 | Optional |
| [`declarations`](#declarations)             | `declarations: [{ prop: 'ascent-override', value: '90%' }]` | Array<{ prop: string; value: string }> | Optional |

### `src`

**Required**. The path of the font file as a string relative to the directory where the font loader function is called.

### `weight`

Required if the font being used is **not** [variable](https://v-fonts.com/). The font [`weight`](https://developer.mozilla.org/en-US/docs/Web/CSS/font-weight) represented as a string with possible [values](https://developer.mozilla.org/en-US/docs/Web/CSS/font-weight#values) of `'normal'`, `'bold'`, `'lighter'`, `'bolder'` or the specific weight values available for the specific font as strings such as `'400'`.

### `style`

The [`font-style`](https://developer.mozilla.org/en-US/docs/Web/CSS/font-style) with possible string [values](https://developer.mozilla.org/en-US/docs/Web/CSS/font-style#values) of `'normal'`, `'italic'` or `'oblique'` with default value of `'normal'`.

### `display`

The [`font-display`](https://developer.mozilla.org/en-US/docs/Web/CSS/@font-face/font-display) with possible string [values](https://developer.mozilla.org/en-US/docs/Web/CSS/@font-face/font-display#values) of `'auto'`, `'block'`, `'swap'`, `'fallback'` or `'optional'` with default value of `'optional'`.

### `preload`

Default to `true`. Whether the font file should be preloaded or not.

### `fallback`

The fallback font to use if the font cannot be loaded. The possible string values are `'system-ui'` or `'arial'` with no default.

### `adjustFontFallback`

A string or boolean `false` value that sets whether an automatic fallback font should be used to reduce [Cumulative Layout Shift (CLS)](https://nextjs.org/learn/seo/web-performance/cls). The possible values are `'Arial'`, `'Times New Roman'` or `false`. The default is `'Arial'`.

### `variable`

A string value to define the CSS variable name to be used if the style is applied with the [CSS variable method](#css-variables).

### `declarations`

An array of font face [descriptor](https://developer.mozilla.org/en-US/docs/Web/CSS/@font-face#descriptors) key-value pairs that define the generated `@font-face` further such as `{ prop: 'ascent-override', value: '90%' }`.

## Applying Styles

You can apply the font styles in three ways:

- [`className`](#classname)
- [`style`](#style)
- [CSS Variables](#css-variables)

### `className`

Returns a read-only CSS `className` for the loaded font to be passed to an HTML element.

```tsx
<p className={inter.className}>Hello, Next.js!</p>
```

### `style`

Returns a read-only CSS `style` object for the loaded font to be passed to an HTML element, including `style.fontFamily` to access the font family name and fallback fonts.

```tsx
<p style={inter.style}>Hello World</p>
```

### CSS Variables

If you would like to set your styles in an external style sheet and specify additional options there, use the CSS variable method.

In addition to importing the font, also import the CSS file where the CSS variable is defined and set the variable option of the font loader object as follows:

```tsx
import { Inter } from '@next/font/google'
import styles from '../styles/component.module.css'

const inter = Inter({
  variable: '--inter-font',
})
```

To use the font, set the `className` of the parent container of the text you would like to style to the font loader's `variable` value and the `className` of the text to the `styles` property from the external CSS file.

```tsx
<main className={inter.variable}>
  <p className={styles.text}>Hello World</p>
</main>
```

Define the `text` selector class in the `component.module.css` CSS file as follows:

```css
.text {
  font-family: var(--inter-font);
  font-weight: 200;
  font-style: italic;
}
```

In the example above, the text `Hello World` is styled using the `Inter` font with `font-weight: 200` and `font-style: italic`.

## Next Steps

<div class="card">
  <a href="/docs/basic-features/font-optimization.md">
    <b>Font Optmization</b>
    <small>Learn how to optimize fonts with the Font module.</small>
  </a>
</div>
