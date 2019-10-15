# Declarative State & Side-effect management with [CerebralJS](https://cerebraljs.com/)

## How to use

### Using `create-next-app`

Execute [`create-next-app`](https://github.com/zeit/next.js/tree/canary/packages/create-next-app) with [Yarn](https://yarnpkg.com/lang/en/docs/cli/create/) or [npx](https://github.com/zkat/npx#readme) to bootstrap the example:

```bash
npx create-next-app --example with-cerebral with-cerebral-app
# or
yarn create next-app --example with-cerebral with-cerebral-app
```

### Download manually

Download the example:

```bash
curl https://codeload.github.com/zeit/next.js/tar.gz/master | tar -xz --strip=2 next.js-master/examples/with-cerebral
cd with-cerebral
```

Install it and run:

```bash
npm install
npm run dev
# or
yarn
yarn dev
```

Deploy it to the cloud with [now](https://zeit.co/now) ([download](https://zeit.co/download))

```bash
now
```

## The idea behind the example

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
    .then(user => {
      this.data = user
      this.isLoading = false
    })
    .catch(error => {
      this.error = error
      this.isLoading = false
    })
}
```
