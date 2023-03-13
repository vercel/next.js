# Realtime Edge Messaging with [Ably](https://ably.com/)

**Demo:** [https://next-and-ably.vercel.app/](https://next-and-ably.vercel.app/)

Add realtime data and interactive multi-user experiences to your Next.js apps with [Ably](https://ably.com/), without the infrastructure overhead.

Use Ably in your Next.js application using idiomatic, easy to use hooks.

Using this demo you can:

- [Send and receive](https://ably.com/docs/realtime/messages) realtime messages
- Get notifications of [user presence](https://ably.com/docs/realtime/presence) on channels
- Send [presence updates](https://ably.com/docs/api/realtime-sdk/presence#update) when a new client joins or leaves the demo

This demo is uses the [Ably React Hooks package](https://www.npmjs.com/package/@ably-labs/react-hooks), a simplified syntax for interacting with Ably, which manages the lifecycle of the Ably SDK instances for you taking care to subscribe and unsubscribe to channels and events when your components re-render).

## Deploy your own

Deploy the example using [Vercel](https://vercel.com?utm_source=github&utm_medium=readme&utm_campaign=next-example) or preview live with [StackBlitz](https://stackblitz.com/github/vercel/next.js/tree/canary/examples/with-ably)

**You will need an Ably API key to run this demo, [see below for details](#ably-setup)**

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/git/external?repository-url=https://github.com/vercel/next.js/tree/canary/examples/with-ably&project-name=with-ably&repository-name=with-ably)

## How to use

Execute [`create-next-app`](https://github.com/vercel/next.js/tree/canary/packages/create-next-app) with [npm](https://docs.npmjs.com/cli/init), [Yarn](https://yarnpkg.com/lang/en/docs/cli/create/), or [pnpm](https://pnpm.io) to bootstrap the example:

```bash
npx create-next-app --example with-ably with-ably-app
```

```bash
yarn create next-app --example with-ably with-ably-app
```

```bash
pnpm create next-app --example with-ably with-ably-app
```

Deploy it to the cloud with [Vercel](https://vercel.com/new?utm_source=github&utm_medium=readme&utm_campaign=next-example) ([Documentation](https://nextjs.org/docs/deployment)).

**When deployed, ensure that you set your environment variables (the Ably API key and the deployed Vercel API root) in your Vercel settings**

## Notes

### Ably Setup

In order to send and receive messages you will need an Ably API key.
If you are not already signed up, you can [sign up now for a free Ably account](https://www.ably.com/signup). Once you have an Ably account:

1. Log into your app dashboard.
2. Under **“Your apps”**, click on **“Manage app”** for any app you wish to use for this tutorial, or create a new one with the “Create New App” button.
3. Click on the **“API Keys”** tab.
4. Copy the secret **“API Key”** value from your Root key.
5. Create a .env file in the root of the demo repository
6. Paste the API key into your new env file, along with a env variable for your localhost:

```bash
ABLY_API_KEY=your-ably-api-key:goes-here
API_ROOT=http://localhost:3000
```

### How it Works/Using Ably

#### Configuration

[pages/\_app.js](pages/_app.js) is where the Ably SDK is configured:

```js
import { configureAbly } from '@ably-labs/react-hooks'

const prefix = process.env.API_ROOT || ''
const clientId =
  Math.random().toString(36).substring(2, 15) +
  Math.random().toString(36).substring(2, 15)

configureAbly({
  authUrl: `${prefix}/api/createTokenRequest?clientId=${clientId}`,
  clientId: clientId,
})

function MyApp({ Component, pageProps }) {
  return <Component {...pageProps} />
}

export default MyApp
```

`configureAbly` matches the method signature of the Ably SDK - and requires either a string or a [AblyClientOptions](https://ably.com/docs/api/realtime-sdk#client-options) object. You can use this configuration object to setup your [tokenAuthentication](https://ably.com/docs/core-features/authentication#token-authentication). If you want to use the usePresence function, you'll need to explicitly provide a `clientId`.

You can do this anywhere in your code before the rest of the library is used.

#### useChannel (Publishing and Subscribing to Messages)

The `useChannel` hook lets you subscribe to a channel and receive messages from it:

```js
import { useState } from 'react'
import { useChannel } from '@ably-labs/react-hooks'

export default function Home() {
  const [channel] = useChannel('your-channel', async (message) => {
    console.log('Received Ably message', message)
  })
}
```

Every time a message is sent to `your-channel` it will be logged to the console. You can do whatever you need to with those messages.

##### Publishing a message

The `channel` instance returned by `useChannel` can be used to send messages to the channel. It is a regular Ably JavaScript SDK `channel` instance.

```javascript
channel.publish('test-message', { text: 'message text' })
```

#### usePresence

The `usePresence` hook lets you subscribe to presence events on a channel - this will allow you to get notified when a user joins or leaves the channel. The presence data is automatically updated and your component re-rendered when presence changes:

```js
import { useState } from 'react'
import { usePresence } from '@ably-labs/react-hooks'

export default function Home() {
  const [presenceData, updateStatus] = usePresence('your-channel-name')

  const presentClients = presenceData.map((msg, index) => (
    <li key={index}>
      {msg.clientId}: {msg.data}
    </li>
  ))

  return <ul>{presentClients}</ul>
}
```

You can read more about the hooks available with the Ably Hooks package on the [@ably-labs/ably-hooks documentation on npm](https://www.npmjs.com/package/@ably-labs/react-hooks).
