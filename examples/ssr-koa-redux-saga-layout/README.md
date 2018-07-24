# ssr-koa-redux-saga-layout

### This examples was moved to
[https://github.com/Baiang/ReactSSR](https://github.com/Baiang/ReactSSR)

### Doc
- [中文](https://github.com/Baiang/ReactSSR/blob/master/en.md)
- English

### Features
- Koa: Integrated koa backend architecture (planned to develop optional egg).
- Server-Side Rendering (SSR): Use the Next.js SSR rendering scheme to make development simpler and cooler.
- Css compiler: support for the introduction of less, sass, css development, external resource references.
- Css-in-js: styled-jsx integrated sass solution, easy to use, quickly write css style.
- Code syntax: eslint grammar rule detection and prettier code style checking tools, integrated TypeScript, to make the grammar more - rigorous, code style unified.
- Unit test: jest, greatly reducing the difficulty of writing unit tests, no need for more configuration.
- Grammatical compatibility: support React className and class two styles; css, sass, less, styled-jsx support autoprefixer prefix auto-fill
- Code optimization: support package module analysis npm run analyze: bundles; source Maps.

### Quick Start

```bash
# git clone
> git clone git@github.com:Baiang/ReactSSR.git

# install
> npm install

# dev
> npm run dev

# Eslint code detection and prettier formatting code
> npm run eslint

# Automatic eslint code detection and prettier formatting code
> npm run lint:watch

# Unit test and coverage test
> npm run test

# build
> npm run build

# analyze:bundles
> npm run analyze:bundles

# Start the server
> npm run start
```


### Eslint
You can use the Standard specification or you can choose Airbnb. Eslint offers two specifications:
- Standard (https://github.com/standard/standard)
- Airbnb (https://github.com/airbnb/javascript)

### Unit test
React unit test based on Jest + Enzyme

### Editor syntax highlighting
Styled-jsx syntax highlighting method https://github.com/zeit/styled-jsx

### TODOs
- Add egg
- Add dva
- Add CDN
- Support vue-ssr switch
