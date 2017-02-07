
# Example app with styled-components

## How to use

Download the example [or clone the repo](https://github.com/zeit/next.js):

```bash
curl https://codeload.github.com/zeit/next.js/tar.gz/master | tar -xz --strip=2 next.js-master/examples/with-styled-components
cd with-styled-components
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

This example features how you use a different styling solution than [styled-jsx](https://github.com/zeit/styled-jsx) that also supports universal styles. That means we can serve the required styles for the first render within the HTML and then load the rest in the client. In this case we are using [styled-components](https://github.com/styled-components/styled-components).

For this purpose we are extending the `<Document />` and injecting the server side rendered styles into the `<head>`.

## Notes:

- On initial install, you may see a server-side error: `TypeError: Cannot read property 'cssRules' of undefined when using this line of code` until you actually render a `styled-component`. I have submitted a PR to fix this issue with them [here](https://github.com/styled-components/styled-components/pull/391). For the time being, make sure you render at least one `styled-component` when you use this.
