# Example application using [`next-iron-session-with-JWT-authentication`](https://github.com/majhoolsoft/next-js-with-iron-session-and-JWT-authentication)

---

<p align="center"><b>Online demo at <a href="https://next-js-with-iron-session-and-jwt-authentication.vercel.app/">https://next-js-with-iron-session-and-jwt-authentication.vercel.app/</a> 👀</b></p>

---

This example creates an authentication system that uses a **signed and encrypted cookie to store session data with JWT**. It relies on [`next-iron-session`](https://github.com/vvo/next-iron-session),
[`SWR`](https://github.com/vercel/swr) and [`JsonWebToken`](https://github.com/auth0/node-jsonwebtoken).

It uses current best practices for authentication in the Next.js ecosystem.

On the next-iron-session repository (https://github.com/majhoolsoft/next-js-with-iron-session-and-JWT-authentication) you'll find:


**Features:**

- [Static Generation](https://nextjs.org/docs/basic-features/pages#static-generation-recommended) (SG), recommended example
- [Server-side Rendering](https://nextjs.org/docs/basic-features/pages#server-side-rendering) (SSR) example in case you need it
- Logged in status synchronized between browser windows/tabs using **`useUser`** hook and [`swr`](https://swr.vercel.app/) module
- Layout based on the user's logged-in/out status
- Session data is signed and encrypted in a cookie
- Express / Connect middlewares
- Multiple encryption keys (passwords) to allow for seamless updates or just password rotation

[`next-iron-session-with-JWT-Auth`](https://github.com/majhoolsoft/next-js-with-iron-session-and-JWT-authentication) now supports:
- JWT authentication

## Preview

Preview the example live on [Vercel](http://vercel.com/):

[![Open in Vercel](https://vercel.com/button)](https://next-js-with-iron-session-and-jwt-authentication.vercel.app/)

## Implement your own

[`Example with Graphql API is comming soon.`](#)

This package comes with 2 sample data files which can be found in /lib.

sampleData.json is an example of access response from server, sampleData2.json is an example of refreshed access token

## How to use

1. Clone this project. then:

```bash
npm run install
```

2. Set up your authentication index keys according to your server response as environment variables (.env).

3. Write your own authentication request in /lib/authenticate.js and refresh access token request in /lib/refreshToken.js

Deploy it to the cloud with [Vercel](https://vercel.com/new?utm_source=github&utm_medium=readme&utm_campaign=next-example) ([Documentation](https://nextjs.org/docs/deployment)).
<!-- 
4.  
```bash
npm run dev 
#or
npm run build
``` -->
