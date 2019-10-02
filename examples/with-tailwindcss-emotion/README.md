# Tailwind CSS with Emotion.js example

This is an example of how you can add the tailwind CSS with Emotion.js in your web app.

## How to use

### Using `create-next-app`

Execute [`create-next-app`](https://github.com/segmentio/create-next-app) with [Yarn](https://yarnpkg.com/lang/en/docs/cli/create/) or [npx](https://github.com/zkat/npx#readme) to bootstrap the example:

```bash
npx create-next-app --example with-tailwindcss-emotion with-tailwindcss-emotion-app
# or
yarn create next-app --example with-tailwindcss-emotion with-tailwindcss-emotion-app
```

### Download manually

Download the example:

```bash
curl https://codeload.github.com/zeit/next.js/tar.gz/canary | tar -xz --strip=2 next.js-canary/examples/with-tailwindcss-emotion
cd with-tailwindcss-emotion
```

Install it and run:

```bash
npm install
npm run dev
# or
yarn
yarn dev
```

Deploy it to the cloud with [now](https://zeit.co/now) ([download](https://zeit.co/download)):

```bash
now
```

## The idea behind the example

This setup has inspiration from [examples/with-tailwindcss](https://github.com/zeit/next.js/blob/canary/examples/with-tailwindcss/README.md). Along with tailwind, this example will show you how we can work with tailwind and emotion as a styled component. I use `tailwindcss.macros` to help you to able to add your tailwind class inside Emotion.js and it will inject tailwind CSS attribute into the styled component. No need to use CSS files, autoprefix, minifier, etc. you will get the full benefits of Emotion.js.

Otherwise, this example also will give some problems for tailwind new users as well because when you inject tailwind CSS into styled components, it is very hard for debugging your styles. All CSS attributes will appear in your hashed styled class without tailwind class.

For example,
In your editor, we wrote the below code.

```js
const Header = styled.div`
  ${tw`font-mono text-sm text-gray-800 hover:text-red-500`}
`
```

Then, when you inspect this element in your browser.

```css
.css-25og8s-Header {
  font-family: Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New',
    monospace;
  font-size: 0.875rem;
  color: #2d3748;
}
```

However, It depends on your experience in tailwind CSS, this classes in the tailwind library is very easy to remember for developers.
