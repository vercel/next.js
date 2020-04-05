## [Magic](https://magic.link/) and Next.js example

This example shows how you can use [Magic](https://magic.link/) to add paswordless authentication support to your Next.js application.

## Configure Magic

Login to your [Magic](https://magic.link/) account and add new application to get your keys. Don't forget to put keys in `.env` (look for `.env.template` for example) and upload them as secrets to [ZEIT Now](https://zeit.co/now).

```
now secrets add MAGICTESTSECRETKEY VALUE
```

## How to use

### Using `create-next-app`

Execute [`create-next-app`](https://github.com/zeit/next.js/tree/canary/packages/create-next-app) with [npm](https://docs.npmjs.com/cli/init) or [Yarn](https://yarnpkg.com/lang/en/docs/cli/create/) to bootstrap the example:

```bash
npx create-next-app --example magic magic
# or
yarn create next-app --example magic magic
```

## About

Use `/welcome` page to sign up/login to app and then checkout `/` page to see your email. Session is stored in cookie called `coolcookie`.
