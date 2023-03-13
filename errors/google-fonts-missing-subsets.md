# Missing specified subset for a `next/font/google` font

#### Why This Error Occurred

Preload is enabled for a font that is missing a specified subset.

#### Possible Ways to Fix It

##### Specify which subsets to preload for that font.

```js
const inter = Inter({ subsets: ['latin'] })
```

Note: previously it was possible to specify default subsets in your `next.config.js` with the `experimental.fontLoaders` option, but this is no longer supported.

##### Disable preloading for that font

If it's not possible to preload your intended subset you can disable preloading.

```js
const notoSansJapanese = Noto_Sans_JP({
  weight: '400',
  preload: false,
})
```

### Useful Links

[Specifying a subset](https://nextjs.org/docs/basic-features/font-optimization#specifying-a-subset)
