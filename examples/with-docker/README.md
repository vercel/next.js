[![Deploy to now](https://deploy.now.sh/static/button.svg)](https://deploy.now.sh/?repo=https://github.com/zeit/next.js/tree/master/examples/with-docker&env=API_URL&docker=true)

# With Docker

## How to use

### Using `create-next-app`

Execute [`create-next-app`](https://github.com/segmentio/create-next-app) with [Yarn](https://yarnpkg.com/lang/en/docs/cli/create/) or [npx](https://github.com/zkat/npx#readme) to bootstrap the example:

```bash
npx create-next-app --example with-docker with-docker-app
# or
yarn create next-app --example with-docker with-docker-app
```

### Download manually

Download the example:

```bash
curl https://codeload.github.com/zeit/next.js/tar.gz/canary | tar -xz --strip=2 next.js-canary/examples/with-docker
cd with-docker
```

Build it with docker:

```bash
# build
docker build -t next-app .
# or, use multi-stage builds to build a smaller docker image
docker build -t next-app -f ./Dockerfile.multistage .
```

Run it:

```bash
docker run --rm -it \
  -p 3000:3000 \
  -e "API_URL=https://example.com" \
  next-app
```

Deploy it to the cloud with [now](https://zeit.co/now) ([download](https://zeit.co/download))

```bash
now --docker -e API_URL="https://example.com"
```

>*Note: Multi-stage only works in OSS plan. [\[#962\]](https://github.com/zeit/now-cli/issues/962#issuecomment-383860104)*

## The idea behind the example

This example show how to set custom environment variables for your __docker application__ at runtime.

The `dockerfile` is the simplest way to run Next.js app in docker, and the size of output image is `173MB`. However, for an even smaller build, you can do multi-stage builds with `dockerfile.multistage`. The size of output image is `85MB`.

You can check the [Example Dockerfile for your own Node.js project](https://github.com/mhart/alpine-node/tree/43ca9e4bc97af3b1f124d27a2cee002d5f7d1b32#example-dockerfile-for-your-own-nodejs-project) section in [mhart/alpine-node](https://github.com/mhart/alpine-node) for more details.