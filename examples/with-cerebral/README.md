# Declarative State & Side-effect management with [CerebralJS](https://cerebraljs.com/)

Use [CerebralJS](https://cerebraljs.com/) to manage an apps state and side effects in a declarative manner:

Declarative CerebralJS:

```js
;[
  setLoading(true),
  getUser,
  {
    success: setUser,
    error: setError,
  },
  setLoading(false),
]
```

vs imperative JS:

```js
function getUser() {
  this.isLoading = true
  ajax
    .get('/user')
    .then((user) => {
      this.data = user
      this.isLoading = false
    })
    .catch((error) => {
      this.error = error
      this.isLoading = false
    })
}
```

## Deploy your own

Deploy the example using [Vercel](https://vercel.com):

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/import/project?template=https://github.com/vercel/next.js/tree/canary/examples/with-cerebral)

## How to use

Execute [`create-next-app`](https://github.com/vercel/next.js/tree/canary/packages/create-next-app) with [npm](https://docs.npmjs.com/cli/init) or [Yarn](https://yarnpkg.com/lang/en/docs/cli/create/) to bootstrap the example:

```bash
npx create-next-app --example with-cerebral with-cerebral-app
# or
yarn create next-app --example with-cerebral with-cerebral-app
```

Deploy it to the cloud with [Vercel](https://vercel.com/import?filter=next.js&utm_source=github&utm_medium=readme&utm_campaign=next-example) ([Documentation](https://nextjs.org/docs/deployment)).
