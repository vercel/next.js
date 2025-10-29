---
title: How to think about data security in Next.js
nav_title: Data Security
description: Learn the built-in data security features in Next.js and learn best practices for protecting your application's data.
related:
  title: Next Steps
  description: Learn more about the topics mentioned in this guide.
  links:
    - app/guides/authentication
    - app/guides/content-security-policy
    - app/guides/forms
---

[React Server Components](https://react.dev/reference/rsc/server-components) improve performance and simplify data fetching, but also shift where and how data is accessed, changing some of the traditional security assumptions for handling data in frontend apps.

This guide will help you understand how to think about data security in Next.js and how to implement best practices.

## Data fetching approaches

There are three main approaches we recommend for fetching data in Next.js, depending on the size and age of your project:

- [HTTP APIs](#external-http-apis): for existing large applications and organizations.
- [Data Access Layer](#data-access-layer): for new projects.
- [Component-Level Data Access](#component-level-data-access): for prototypes and learning.

We recommend choosing one data fetching approach and avoiding mixing them. This makes it clear for both developers working in your code base and security auditors what to expect.

### External HTTP APIs

You should follow a **Zero Trust** model when adopting Server Components in an existing project. You can continue calling your existing API endpoints such as REST or GraphQL from Server Components using [`fetch`](/docs/app/api-reference/functions/fetch), just as you would in Client Components.

```tsx filename="app/page.tsx"
import { cookies } from 'next/headers'

export default async function Page() {
  const cookieStore = cookies()
  const token = cookieStore.get('AUTH_TOKEN')?.value

  const res = await fetch('https://api.example.com/profile', {
    headers: {
      Cookie: `AUTH_TOKEN=${token}`,
      // Other headers
    },
  })

  // ....
}
```

This approach works well when:

- You already have security practices in place.
- Separate backend teams use other languages or manage APIs independently.

### Data Access Layer

For new projects, we recommend creating a dedicated **Data Access Layer (DAL)**. This is a internal library that controls how and when data is fetched, and what gets passed to your render context.

A Data Access Layer should:

- Only run on the server.
- Perform authorization checks.
- Return safe, minimal **Data Transfer Objects (DTOs)**.

This approach centralizes all data access logic, making it easier to enforce consistent data access and reduces the risk of authorization bugs. You also get the benefit of sharing an in-memory cache across different parts of a request.

```ts filename="data/auth.ts"
import { cache } from 'react'
import { cookies } from 'next/headers'

// Cached helper methods makes it easy to get the same value in many places
// without manually passing it around. This discourages passing it from Server
// Component to Server Component which minimizes risk of passing it to a Client
// Component.
export const getCurrentUser = cache(async () => {
  const token = cookies().get('AUTH_TOKEN')
  const decodedToken = await decryptAndValidate(token)
  // Don't include secret tokens or private information as public fields.
  // Use classes to avoid accidentally passing the whole object to the client.
  return new User(decodedToken.id)
})
```

```tsx filename="data/user-dto.tsx"
import 'server-only'
import { getCurrentUser } from './auth'

function canSeeUsername(viewer: User) {
  // Public info for now, but can change
  return true
}

function canSeePhoneNumber(viewer: User, team: string) {
  // Privacy rules
  return viewer.isAdmin || team === viewer.team
}

export async function getProfileDTO(slug: string) {
  // Don't pass values, read back cached values, also solves context and easier to make it lazy

  // use a database API that supports safe templating of queries
  const [rows] = await sql`SELECT * FROM user WHERE slug = ${slug}`
  const userData = rows[0]

  const currentUser = await getCurrentUser()

  // only return the data relevant for this query and not everything
  // <https://www.w3.org/2001/tag/doc/APIMinimization>
  return {
    username: canSeeUsername(currentUser) ? userData.username : null,
    phonenumber: canSeePhoneNumber(currentUser, userData.team)
      ? userData.phonenumber
      : null,
  }
}
```

```tsx filename="app/page.tsx"
import { getProfile } from '../../data/user'

export async function Page({ params: { slug } }) {
  // This page can now safely pass around this profile knowing
  // that it shouldn't contain anything sensitive.
  const profile = await getProfile(slug);
  ...
}
```

> **Good to know:** Secret keys should be stored in environment variables, but only the Data Access Layer should access `process.env`. This keeps secrets from being exposed to other parts of the application.

### Component-level data access

For quick prototypes and iteration, database queries can be placed directly in Server Components.

This approach, however, makes it easier to accidentally expose private data to the client, for example:

```tsx filename="app/page.tsx"
import Profile from './components/profile.tsx'

export async function Page({ params: { slug } }) {
  const [rows] = await sql`SELECT * FROM user WHERE slug = ${slug}`
  const userData = rows[0]
  // EXPOSED: This exposes all the fields in userData to the client because
  // we are passing the data from the Server Component to the Client.
  return <Profile user={userData} />
}
```

```tsx filename="app/ui/profile.tsx"
'use client'

// BAD: This is a bad props interface because it accepts way more data than the
// Client Component needs and it encourages server components to pass all that
// data down. A better solution would be to accept a limited object with just
// the fields necessary for rendering the profile.
export default async function Profile({ user }: { user: User }) {
  return (
    <div>
      <h1>{user.name}</h1>
      ...
    </div>
  )
}
```

You should sanitize the data before passing it to the Client Component:

```ts filename="data/user.ts"
import { sql } from './db'

export async function getUser(slug: string) {
  const [rows] = await sql`SELECT * FROM user WHERE slug = ${slug}`
  const user = rows[0]

  // Return only the public fields
  return {
    name: user.name,
  }
}
```

```tsx filename="app/page.tsx"
import { getUser } from '../data/user'
import Profile from './ui/profile'

export default async function Page({
  params: { slug },
}: {
  params: { slug: string }
}) {
  const publicProfile = await getUser(slug)
  return <Profile user={publicProfile} />
}
```

## Reading data

### Passing data from server to client

On the initial load, both Server and Client Components run on the server to generate HTML. However, they execute in isolated module systems. This ensures that Server Components can access private data and APIs, while Client Components cannot.

**Server Components:**

- Run only on the server.
- Can safely access environment variables, secrets, databases, and internal APIs.

**Client Components:**

- Run on the server during pre-rendering, but must follow the same security assumptions as code running in the browser.
- Must not access privileged data or server-only modules.

This ensures the app is secure by default, but it's possible to accidentally expose private data through how data is fetched or passed to components.

### Tainting

To prevent accidental exposure of private data to the client, you can use React Taint APIs:

- [`experimental_taintObjectReference`](https://react.dev/reference/react/experimental_taintObjectReference) for data objects.
- [`experimental_taintUniqueValue`](https://react.dev/reference/react/experimental_taintUniqueValue) for specific values.

You can enable usage in your Next.js app with the [`experimental.taint`](/docs/app/api-reference/config/next-config-js/taint) option in `next.config.js`:

```js filename="next.config.js"
module.exports = {
  experimental: {
    taint: true,
  },
}
```

This prevents the tainted objects or values from being passed to the client. However, it's an additional layer of protection, you should still filter and sanitize the data in your [DAL](#data-access-layer) before passing it to React's render context.

> **Good to know:**
>
> - By default, environment variables are only available on the Server. Next.js exposes any environment variable prefixed with `NEXT_PUBLIC_` to the client. [Learn more](/docs/app/guides/environment-variables).
> - Functions and classes are already blocked from being passed to Client Components by default.

### Preventing client-side execution of server-only code

To prevent server-only code from being executed on the client, you can mark a module with the [`server-only`](https://www.npmjs.com/package/server-only) package:

```bash package="npm"
npm install server-only
```

```bash package="yarn"
yarn add server-only
```

```bash package="pnpm"
pnpm add server-only
```

```bash package="bun"
bun add server-only
```

```ts filename="lib/data.ts"
import 'server-only'

//...
```

This ensures that proprietary code or internal business logic stays on the server by causing a build error if the module is imported in the client environment.

## Mutating Data

Next.js handles mutations with [Server Actions](https://react.dev/reference/rsc/server-functions).

### Built-in Server Actions Security features

By default, when a Server Action is created and exported, it creates a public HTTP endpoint and should be treated with the same security assumptions and authorization checks. This means, even if a Server Action or utility function is not imported elsewhere in your code, it's still publicly accessible.

To improve security, Next.js has the following built-in features:

- **Secure action IDs:** Next.js creates encrypted, non-deterministic IDs to allow the client to reference and call the Server Action. These IDs are periodically recalculated between builds for enhanced security.
- **Dead code elimination:** Unused Server Actions (referenced by their IDs) are removed from client bundle to avoid public access.

> **Good to know**:
>
> The IDs are created during compilation and are cached for a maximum of 14 days. They will be regenerated when a new build is initiated or when the build cache is invalidated.
> This security improvement reduces the risk in cases where an authentication layer is missing. However, you should still treat Server Actions like public HTTP endpoints.

```jsx
// app/actions.js
'use server'

// If this action **is** used in our application, Next.js
// will create a secure ID to allow the client to reference
// and call the Server Action.
export async function updateUserAction(formData) {}

// If this action **is not** used in our application, Next.js
// will automatically remove this code during `next build`
// and will not create a public endpoint.
export async function deleteUserAction(formData) {}
```

### Validating client input

You should always validate input from client, as they can be easily modified. For example, form data, URL parameters, headers, and searchParams:

```tsx filename="app/page.tsx"
// BAD: Trusting searchParams directly
export default async function Page({ searchParams }) {
  const isAdmin = searchParams.get('isAdmin')
  if (isAdmin === 'true') {
    // Vulnerable: relies on untrusted client data
    return <AdminPanel />
  }
}

// GOOD: Re-verify every time
import { cookies } from 'next/headers'
import { verifyAdmin } from './auth'

export default async function Page() {
  const token = cookies().get('AUTH_TOKEN')
  const isAdmin = await verifyAdmin(token)

  if (isAdmin) {
    return <AdminPanel />
  }
}
```

### Authentication and authorization

You should always ensure that a user is authorized to perform an action. For example:

```tsx filename="app/actions.ts"
'use server'

import { auth } from './lib'

export function addItem() {
  const { user } = auth()
  if (!user) {
    throw new Error('You must be signed in to perform this action')
  }

  // ...
}
```

Learn more about [Authentication](/docs/app/guides/authentication) in Next.js.

### Closures and encryption

Defining a Server Action inside a component creates a [closure](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Closures) where the action has access to the outer function's scope. For example, the `publish` action has access to the `publishVersion` variable:

```tsx filename="app/page.tsx" switcher
export default async function Page() {
  const publishVersion = await getLatestVersion();

  async function publish() {
    "use server";
    if (publishVersion !== await getLatestVersion()) {
      throw new Error('The version has changed since pressing publish');
    }
    ...
  }

  return (
    <form>
      <button formAction={publish}>Publish</button>
    </form>
  );
}
```

```jsx filename="app/page.js" switcher
export default async function Page() {
  const publishVersion = await getLatestVersion();

  async function publish() {
    "use server";
    if (publishVersion !== await getLatestVersion()) {
      throw new Error('The version has changed since pressing publish');
    }
    ...
  }

  return (
    <form>
      <button formAction={publish}>Publish</button>
    </form>
  );
}
```

Closures are useful when you need to capture a _snapshot_ of data (e.g. `publishVersion`) at the time of rendering so that it can be used later when the action is invoked.

However, for this to happen, the captured variables are sent to the client and back to the server when the action is invoked. To prevent sensitive data from being exposed to the client, Next.js automatically encrypts the closed-over variables. A new private key is generated for each action every time a Next.js application is built. This means actions can only be invoked for a specific build.

> **Good to know:** We don't recommend relying on encryption alone to prevent sensitive values from being exposed on the client.

### Overwriting encryption keys (advanced)

When self-hosting your Next.js application across multiple servers, each server instance may end up with a different encryption key, leading to potential inconsistencies.

To mitigate this, you can overwrite the encryption key using the `process.env.NEXT_SERVER_ACTIONS_ENCRYPTION_KEY` environment variable. Specifying this variable ensures that your encryption keys are persistent across builds, and all server instances use the same key. This variable **must** be AES-GCM encrypted.

This is an advanced use case where consistent encryption behavior across multiple deployments is critical for your application. You should consider standard security practices such key rotation and signing.

> **Good to know:** Next.js applications deployed to Vercel automatically handle this.

### Allowed origins (advanced)

Since Server Actions can be invoked in a `<form>` element, this opens them up to [CSRF attacks](https://developer.mozilla.org/en-US/docs/Glossary/CSRF).

Behind the scenes, Server Actions use the `POST` method, and only this HTTP method is allowed to invoke them. This prevents most CSRF vulnerabilities in modern browsers, particularly with [SameSite cookies](https://web.dev/articles/samesite-cookies-explained) being the default.

As an additional protection, Server Actions in Next.js also compare the [Origin header](https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Origin) to the [Host header](https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Host) (or `X-Forwarded-Host`). If these don't match, the request will be aborted. In other words, Server Actions can only be invoked on the same host as the page that hosts it.

For large applications that use reverse proxies or multi-layered backend architectures (where the server API differs from the production domain), it's recommended to use the configuration option [`serverActions.allowedOrigins`](/docs/app/api-reference/config/next-config-js/serverActions) option to specify a list of safe origins. The option accepts an array of strings.

```js filename="next.config.js"
/** @type {import('next').NextConfig} */
module.exports = {
  experimental: {
    serverActions: {
      allowedOrigins: ['my-proxy.com', '*.my-proxy.com'],
    },
  },
}
```

Learn more about [Security and Server Actions](https://nextjs.org/blog/security-nextjs-server-components-actions).

### Avoiding side-effects during rendering

Mutations (e.g. logging out users, updating databases, invalidating caches) should never be a side-effect, either in Server or Client Components. Next.js explicitly prevents setting cookies or triggering cache revalidation within render methods to avoid unintended side effects.

```tsx filename="app/page.tsx"
// BAD: Triggering a mutation during rendering
export default async function Page({ searchParams }) {
  if (searchParams.get('logout')) {
    cookies().delete('AUTH_TOKEN')
  }

  return <UserProfile />
}
```

Instead, you should use Server Actions to handle mutations.

```tsx filename="app/page.tsx"
// GOOD: Using Server Actions to handle mutations
import { logout } from './actions'

export default function Page() {
  return (
    <>
      <UserProfile />
      <form action={logout}>
        <button type="submit">Logout</button>
      </form>
    </>
  )
}
```

> **Good to know:** Next.js uses `POST` requests to handle mutations. This prevents accidental side-effects from GET requests, reducing Cross-Site Request Forgery (CSRF) risks.

## Auditing

If you're doing an audit of a Next.js project, here are a few things we recommend looking extra at:

- **Data Access Layer:** Is there an established practice for an isolated Data Access Layer? Verify that database packages and environment variables are not imported outside the Data Access Layer.
- **`"use client"` files:** Are the Component props expecting private data? Are the type signatures overly broad?
- **`"use server"` files:** Are the Action arguments validated in the action or inside the Data Access Layer? Is the user re-authorized inside the action?
- **`/[param]/.`** Folders with brackets are user input. Are params validated?
- **`proxy.ts` and `route.ts`:** Have a lot of power. Spend extra time auditing these using traditional techniques. Perform Penetration Testing or Vulnerability Scanning regularly or in alignment with your team's software development lifecycle.
