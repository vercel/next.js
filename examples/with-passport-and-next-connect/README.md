# next-connect and Passport

This example creates a basic [CRUD](https://en.wikipedia.org/wiki/Create,_read,_update_and_delete) app using [next-connect](https://github.com/hoangvvo/next-connect) and cookie-based authentication with [Passport.js](http://www.passportjs.org/). The cookie is securely encrypted using [@hapi/iron](https://github.com/hapijs/iron).

The example shows how to do a sign up, login, logout, and account deactivation. It utilizes [SWR](https://swr.now.sh/) to fetch the API.

For demo purpose, the users database is stored in the cookie session. You need to replace it with an actual database to store users in [db.js](lib/db.js).

In production, you must use a password hashing library, such as [argon2](https://github.com/ranisalt/node-argon2) or [bcrypt](https://www.npmjs.com/package/bcrypt).

## Deploy your own

Deploy the example using [Vercel](https://vercel.com):

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/import/project?template=https://github.com/vercel/next.js/tree/canary/examples/with-passport-and-next-connect)

## How to use

Execute [`create-next-app`](https://github.com/vercel/next.js/tree/canary/packages/create-next-app) with [npm](https://docs.npmjs.com/cli/init) or [Yarn](https://yarnpkg.com/lang/en/docs/cli/create/) to bootstrap the example:

```bash
npx create-next-app --example with-passport-and-next-connect with-passport-and-next-connect-app
# or
yarn create next-app --example with-passport-and-next-connect with-passport-and-next-connect-app
```

Deploy it to the cloud with [Vercel](https://vercel.com/import?filter=next.js&utm_source=github&utm_medium=readme&utm_campaign=next-example) ([Documentation](https://nextjs.org/docs/deployment)).
