# Example app utilizing cookie-based authentication

## Deploy your own

Deploy the example using [ZEIT Now](https://zeit.co/now):

[![Deploy with ZEIT Now](https://zeit.co/button)](https://zeit.co/new/project?template=https://github.com/zeit/next.js/tree/canary/examples/with-cookie-auth-fauna)

## How to use

### Using `create-next-app`

Download [`create-next-app`](https://github.com/zeit/next.js/tree/canary/packages/create-next-app) to bootstrap the example:

```
npm i -g create-next-app
create-next-app --example with-cookie-auth-fauna with-cookie-auth-fauna-app
```

### Download manually

Download the example [or clone the repo](https://github.com/zeit/next.js):

```bash
curl https://codeload.github.com/zeit/next.js/tar.gz/canary | tar -xz --strip=2 next.js-canary/examples/with-cookie-auth-fauna
cd with-cookie-auth-fauna
```

### Run locally

After you clone the repository you can install the dependencies. You'll need to create an account on [Fauna](https://fauna.com/) and create a database, a `User` collection, a `users_by_email` index, and a server and client key. For more information on how to do that, please refer to the [Authentication tutorial](https://app.fauna.com/tutorials/authentication). Add your server and client key to the `.env` file at the project root.

Then run `yarn dev` and start hacking! You'll be able to see the application running locally as if it were deployed.

```bash
$ cd with-cookie-auth-fauna
$ (with-cookie-auth-fauna/) yarn install
$ (with-cookie-auth-fauna/) yarn dev
```

### Deploy

Deploy it to the cloud with [now](https://zeit.co/now) ([download](https://zeit.co/download)):

```bash
now
```

## The idea behind the example

In this example, we authenticate users and store a token in a secure (non-JS) cookie. The example only shows how the user session works, keeping a user logged in between pages.

This example uses Fauna(https://fauna.com/) as the auth service and DB.

The repo includes a minimal auth backend built with the new [API Routes support](https://github.com/zeit/next.js/pull/7296) (`pages/api`), [Micro](https://www.npmjs.com/package/micro), [Fauna for Auth](https://app.fauna.com/tutorials/authentication) and [dotenv](https://github.com/zeit/next.js/tree/canary/examples/with-dotenv) for environment variables. The backend allows the user to create an account (a User document), login, and see their user id (User ref id).

Session is synchronized across tabs. If you logout your session gets removed on all the windows as well. We use the HOC `withAuthSync` for this.

The helper function `auth` helps to retrieve the token across pages and redirects the user if not token was found.
