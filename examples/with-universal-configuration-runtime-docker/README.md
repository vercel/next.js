[![Deploy to now](https://deploy.now.sh/static/button.svg)](https://deploy.now.sh/?repo=https://github.com/zeit/next.js/tree/master/examples/with-universal-configuration-runtime-docker&env=API_URL&docker=true)

# With universal runtime configuration

## How to use

### Using `create-next-app`

Execute [`create-next-app`](https://github.com/segmentio/create-next-app) with [Yarn](https://yarnpkg.com/lang/en/docs/cli/create/) or [npx](https://github.com/zkat/npx#readme) to bootstrap the example:

```bash
npx create-next-app --example with-universal-configuration-runtime-docker with-universal-configuration-runtime-docker-app
# or
yarn create next-app --example with-universal-configuration-runtime-docker with-universal-configuration-runtime-docker-app
```

### Download manually

Download the example [or clone the repo](https://github.com/zeit/next.js):

```bash
curl https://codeload.github.com/zeit/next.js/tar.gz/canary | tar -xz --strip=2 next.js-canary/examples/with-universal-configuration-runtime-docker
cd with-universal-configuration-runtime-docker
```

Build it and run:

```bash
# build
docker build -t next-app .
# run
docker run --rm -it \
  -p 3000:3000 \
  -e "API_URL=https://example.com" \
  next-app
```

Deploy it to the cloud with [now](https://zeit.co/now) ([download](https://zeit.co/download))

```bash
now --docker -e API_URL="https://example.com"
```

## The idea behind the example

This example show how to set custom environment variables for your docker application at runtime
