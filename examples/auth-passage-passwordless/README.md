# Passwordless Authentication with Passage and Next.js

## What is Passage
Passage is a passwordless authentication system that leverages biometrics (with a fallback of magic links) to authenticate users on your websites or mobile applications.  By leveraging the [WebAuthn protocol](https://webauthn.io/) from the [FIDO Alliance](https://fidoalliance.org/), Passage can increase security and reduce end user friction.   

Passage provides a full UI/UX login and registration in a web component that can be added to any application, as well as backend libraries in Python, Go, and Node.js to support user verification. To learn more [visit our website](https://passage.id).

This example application uses the [Passage Auth Element](https://www.npmjs.com/package/@passageidentity/passage-elements) in a Next.js application to authenticate users using biometrics or magic links.

[Passage Node.js SDK](https://www.npmjs.com/package/@passageidentity/passage-node) is used to verify users on authenticated endpoints. To run this example application, follow the instructions below.

## Configure Your Environment Variables

1. Copy the text in the `EXAMPLE.env` file to your own `.env` file.
2. Replace the example variables with your own Passage API Key. You can get this from the [Passage Console](https://console.passage.id). You'll have to register and login, and then create a new application.  (Note that you'll use Passage to do so.)
3. The API Key can be created and retrieved from the `Setting/API Keys` page.  _**Note that the API Key should remain secret and not checked into your source control system.**_
4. Copy the Application ID value from your Passage Console Dashboard and put it in the spot designated for it in the `next.config.js` file.  Note that the AppID need not be secret.

### Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
```

Then, ensure that all the dependencies are properly installed by running:

```bash
npm install
```

Once that is complete, open a browser and navigate to [http://localhost:3000](http://localhost:3000)  to see the result.

## Using Passage with Next.js

### Importing and Using the Passage-Auth Custom Element

The easiest way to add authentication to a web frontend is with a Passage Auth custom element. First you'll need to install the [passage-elements](https://www.npmjs.com/package/@passageidentity/passage-elements) package from npm:

```bash
npm i --save @passageidentity/passage-elements
```
Importing `@passageidentity/passage-elements/passage-auth` triggers a side-effect that will register the passage-auth custom element with the client browser for usage. Since Next.js pre-renders pages on the server this presents a common issue with using web components, such as the Passage elements, in pre-rendered pages - when the server side pre-render occurs there is no client window defined to call `window.customElements.define()` on, which results in an error being thrown.

The most common solution when using custom elements in pre-rendered applications is to defer the registration of the custom element to a lifecycle hook so that the code is only executed when the client app is executed in browser. This is done in this example in `pages/index.tsx`

### Getting Authentication Status and User Information with Server-Side Rendering

After the user has logged in with Passage, all requests need to be authenticated using the JWT provided by Passage. Use the [Passage Node.js SDK](https://www.npmjs.com/package/@passageidentity/passage-node) to authenticate requests and retrieve user data for your application. 

In this example, we handle authentication securely in Next.js's server-side rendering function [`getServerSideProps()`](https://nextjs.org/docs/basic-features/data-fetching#getserversideprops-server-side-rendering). Per Next.js documention you can import modules in top-level scope for use in `getServerSideProps`. Imports used in `getServerSideProps` will not be bundled for the client-side. This means you can write server-side code directly in `getServerSideProps`.

The JWT provided by Passage is stored in both cookies and localstorage. Next.js provides the cookies set for an application to `getServerSideProps` which allows passing the JWT from the client browser to the server to handle authentication.

This is done in this example in `pages/dashboard.tsx`.

## Documentation

We have a [page in our documentation that deals with Next.js](https://docs.passage.id/frontend/examples-by-framework/next.js).