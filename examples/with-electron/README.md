# Electron application example

## How to use

Download the example [or clone the repo](https://github.com/zeit/next.js):

```bash
curl https://codeload.github.com/zeit/next.js/tar.gz/master | tar -xz --strip=2 next.js-master/examples/with-electron
cd with-electron
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

This example show how you can use Next.js inside an Electron application to avoid a lot of configuration, have routes and use server-render to speed up the initial render of the application.

> **Warning**: This run a local server, so the user can access it from the browser. To avoid this we check the user-agent, but it's not 100% secure and can be skipped.
