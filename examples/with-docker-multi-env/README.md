# With Docker - Multiple Deployment Environments

This examples shows how to use Docker with Next.js and deploy to multiple environment with different env values. Based on the [deployment documentation](https://nextjs.org/docs/app/getting-started/deploying#docker).

## How to use

Execute [`create-next-app`](https://github.com/vercel/next.js/tree/canary/packages/create-next-app) with [npm](https://docs.npmjs.com/cli/init), [Yarn](https://yarnpkg.com/lang/en/docs/cli/create/), or [pnpm](https://pnpm.io) to bootstrap the example:

```bash
npx create-next-app --example with-docker-multi-env nextjs-docker-multi-env
```

```bash
yarn create next-app --example with-docker-multi-env nextjs-docker-multi-env
```

```bash
pnpm create next-app --example with-docker-multi-env nextjs-docker-multi-env
```

Enter the values in the `.env.development.sample`, `.env.staging.sample`, `.env.production.sample` files to be used for each environments.

## Environment variables

Each environment has a separate image because `NEXT_PUBLIC_` values are inlined into the JavaScript bundle during `next build`. The Dockerfile for each environment copies its `.sample` file to `.env.production` before the build.

Only put public, non-secret values in the `.sample` files. With `output: "standalone"`, the build copies `.env.production` into `.next/standalone`, and the Dockerfile copies that directory into the final image, so the file can be read by anyone who can pull the image.

Pass secrets and other server-only values when the container starts. Each `compose.yaml` forwards `API_SECRET` from your shell, and [`pages/api/secret.js`](./pages/api/secret.js) reports whether the server received it:

```bash
API_SECRET=value make start-production
curl http://localhost:3003/api/secret
```

Values set at run time take precedence over the copied `.env.production` file, and any variable you don't set falls back to the value in that file.

The [`.dockerignore`](./.dockerignore) leaves `.env` and `.env*.local` out of the build context, so local development values never reach an image. See [Environment variable files](https://nextjs.org/docs/app/api-reference/config/next-config-js/output#environment-variable-files) for how standalone output handles env files.

## Using Docker and Makefile

### Development environment - for doing testing

```
make build-development
make start-development
```

Open http://localhost:3001

### Staging environment - for doing UAT testing

```
make build-staging
make start-staging
```

Open http://localhost:3002

### Production environment - for users

```
make build-production
make start-production
```

Open http://localhost:3003

## Running Locally

First, run the development server:

```bash
npm run dev
# or
yarn dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `pages/index.js`. The page auto-updates as you edit the file.

[API routes](https://nextjs.org/docs/pages/building-your-application/routing/api-routes) can be accessed on [http://localhost:3000/api/hello](http://localhost:3000/api/hello). This endpoint can be edited in `pages/api/hello.js`.

The `pages/api` directory is mapped to `/api/*`. Files in this directory are treated as [API routes](https://nextjs.org/docs/pages/building-your-application/routing/api-routes) instead of React pages.
