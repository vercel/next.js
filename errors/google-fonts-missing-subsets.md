# Missing specified subset for a `@next/font/google` font

#### Why This Error Occurred

Preload is enabled for a font that is missing a specified subset.

#### Possible Ways to Fix It

##### Specify which subsets to preload for that font.

- On a font per font basis by adding it to the function call

```js
const inter = Inter({ subsets: ['latin'] })
```

- Globally for all your fonts

```js
// next.config.js
module.exports = {
  experimental: {
    fontLoaders: [
      { loader: '@next/font/google', options: { subsets: ['latin'] } },
    ],
  },
}
```

If both are configured, the subset in the function call is used.

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
