[![Deploy to now](https://deploy.now.sh/static/button.svg)](https://deploy.now.sh/?repo=https://github.com/zeit/next.js/tree/master/examples/with-react-native-web)

## How to use

### Using `create-next-app`

Download [`create-next-app`](https://github.com/segmentio/create-next-app) to bootstrap the example:

```
npm i -g create-next-app
create-next-app --example with-react-native-web
```

### Download manually

Download the example [or clone the repo](https://github.com/zeit/next.js):

```bash
curl https://codeload.github.com/zeit/next.js/tar.gz/canary | tar -xz --strip=2 next.js-canary/examples/with-emotion
cd with-react-native-web
```

Install it and run:

```bash
npm install
npm run dev
```

Deploy it to the cloud with [now](https://zeit.co/now) ([download](https://zeit.co/download))

```bash
now
```

## The idea behind the example

This example features how to use [react-native-web](https://github.com/necolas/react-native-web) to bring the platform-agnostic Components and APIs of React Native to the web.

> **High-quality user interfaces**: React Native for Web makes it easy to create fast, adaptive web UIs in JavaScript. It provides native-like interactions, support for multiple input modes (touch, mouse, keyboard), optimized vendor-prefixed styles, built-in support for RTL layout, built-in accessibility, and integrates with React Dev Tools.
>
> **Write once, render anywhere**: React Native for Web interoperates with existing React DOM components and is compatible with the majority of the React Native API. You can develop new components for native and web without rewriting existing code. React Native for Web can also render to HTML and critical CSS on the server using Node.js.
