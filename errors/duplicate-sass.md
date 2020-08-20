# Duplicate Sass Dependencies

#### Why This Error Occurred

Your project has a direct dependency on both `sass` and `node-sass`, two
different package that both compile Sass files!

Next.js will only use one of these, so it is suggested you remove one or the
other.

#### Possible Ways to Fix It

The `sass` package is a modern implementation of Sass in JavaScript that
supports all the new features and does not require any native dependencies.

Since `sass` is now the canonical implementation, we suggest removing the older
`node-sass` package, which should speed up your builds and project install time.

**Via npm**

```bash
npm uninstall node-sass
```

**Via Yarn**

```bash
yarn remove node-sass
```

### Useful Links

- [`sass` package documentation](https://github.com/sass/dart-sass)
