# Realtime messaging with [Ably](https://ably.com/)

**Demo:** [https://next-and-ably.vercel.app/](https://next-and-ably.vercel.app/)

Add realtime data and interactive multi-user experiences to your Next.js apps with [Ably](https://ably.com/), without the infrastructure overhead.

Use Ably in your Next.js App Router application with the `ably/react` hooks.

Using this demo you can:

- [Send and receive](https://ably.com/docs/realtime/messages) realtime messages
- Get notifications of [user presence](https://ably.com/docs/realtime/presence) on channels
- Send [presence updates](https://ably.com/docs/api/realtime-sdk/presence#update) when a new client joins or leaves the demo

This demo uses the Ably React hooks that ship with the [`ably`](https://www.npmjs.com/package/ably) package, which manages the lifecycle of the Ably SDK instances for you, subscribing and unsubscribing to channels and events as your components mount and unmount.

## Deploy your own

**You will need an Ably API key to run this demo. [See below for details](#ably-setup).**

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https://github.com/vercel/next.js/tree/canary/examples/with-ably&project-name=with-ably&repository-name=with-ably&env=ABLY_API_KEY&envDescription=Ably%20API%20key%20from%20https%3A%2F%2Fably.com%2F)

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

**When deployed, ensure that you set your `ABLY_API_KEY` environment variable in your Vercel project settings.**

## Notes

### Ably setup

In order to send and receive messages you will need an Ably API key.
If you are not already signed up, you can [sign up now for a free Ably account](https://www.ably.com/signup). Once you have an Ably account:

1. Log into your app dashboard.
2. Under **"Your apps"**, click on **"Manage app"** for any app you wish to use for this tutorial, or create a new one with the "Create New App" button.
3. Click on the **"API Keys"** tab.
4. Copy the secret **"API Key"** value from your Root key.
5. Create a `.env.local` file in the root of the project.
6. Paste the API key into your new env file:

```bash
ABLY_API_KEY=your-ably-api-key:goes-here
```

### How it works

#### Client provider

[`app/ably-client-provider.tsx`](app/ably-client-provider.tsx) is a Client Component that creates the Ably Realtime client inside a `useEffect`, so no connection is attempted during SSR. It wraps its children in `AblyProvider` (and `ChannelProvider`) from `ably/react`, making the hooks available to descendant Client Components:

```tsx
"use client";

import { useEffect, useState, type ReactNode } from "react";
import * as Ably from "ably";
import { AblyProvider, ChannelProvider } from "ably/react";

export default function AblyClientProvider({
  children,
}: {
  children: ReactNode;
}) {
  const [clientId] = useState(
    () =>
      Math.random().toString(36).substring(2, 15) +
      Math.random().toString(36).substring(2, 15),
  );
  const [client, setClient] = useState<Ably.Realtime | null>(null);

  useEffect(() => {
    const ably = new Ably.Realtime({
      authUrl: `/api/createTokenRequest?clientId=${clientId}`,
      clientId,
    });
    setClient(ably);
    return () => {
      ably.close();
    };
  }, [clientId]);

  if (!client) {
    return <p>Connecting to Ably...</p>;
  }

  return (
    <AblyProvider client={client}>
      <ChannelProvider channelName="some-channel-name">
        {children}
      </ChannelProvider>
    </AblyProvider>
  );
}
```

`children` only mount once the client exists, so descendants can call `useChannel` / `usePresence` unconditionally without checking a readiness flag — `AblyProvider` is guaranteed to be above the tree.

Wrap `AblyClientProvider` around only the subtree that uses Ably, not your root layout. In this example the static page chrome (heading, intro paragraph, footer) lives outside the provider and renders immediately; only the chat panel waits behind the `Connecting to Ably...` placeholder. Mounting the provider at the root would force your whole app to wait on the WebSocket handshake before anything is visible.

The client is authenticated via a [token request](https://ably.com/docs/core-features/authentication#token-authentication) served by a Route Handler at [`app/api/createTokenRequest/route.ts`](app/api/createTokenRequest/route.ts), so your `ABLY_API_KEY` is never exposed to the browser.

#### useChannel (publishing and subscribing to messages)

The `useChannel` hook lets you subscribe to a channel and receive messages from it:

```tsx
"use client";

import { useState } from "react";
import { useChannel } from "ably/react";
import type * as Ably from "ably";

export default function ChatArea() {
  const [messages, setMessages] = useState<Ably.Message[]>([]);

  const { channel } = useChannel("some-channel-name", (message) => {
    console.log("Received Ably message", message);
    setMessages((prev) => [...prev, message]);
  });

  // publish a message
  const send = () => channel.publish("test-message", { text: "hello" });

  return <button onClick={send}>Send</button>;
}
```

#### usePresence and usePresenceListener

`usePresence` enters presence and lets you update your presence data. `usePresenceListener` subscribes to presence changes on a channel:

```tsx
"use client";

import { usePresence, usePresenceListener } from "ably/react";

export default function Presence() {
  const { updateStatus } = usePresence("some-channel-name");
  const { presenceData } = usePresenceListener("some-channel-name");

  return (
    <>
      <button onClick={() => updateStatus("hello")}>
        Update status to hello
      </button>
      <ul>
        {presenceData.map((msg, i) => (
          <li key={i}>
            {msg.clientId}: {String(msg.data ?? "")}
          </li>
        ))}
      </ul>
    </>
  );
}
```

You can read more about the hooks in the [Ably React docs](https://ably.com/docs/getting-started/react).
