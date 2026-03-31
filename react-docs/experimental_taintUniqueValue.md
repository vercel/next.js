---
title: experimental_taintUniqueValue
version: experimental
---

<Experimental>

**This API is experimental and is not available in a stable version of React yet.**

You can try it by upgrading React packages to the most recent experimental version:

- `react@experimental`
- `react-dom@experimental`
- `eslint-plugin-react-hooks@experimental`

Experimental versions of React may contain bugs. Don't use them in production.

This API is only available inside [React Server Components](/reference/rsc/use-client).

</Experimental>

<Intro>

`taintUniqueValue` lets you prevent unique values from being passed to Client Components like passwords, keys, or tokens.

```js
taintUniqueValue(errMessage, lifetime, value)
```

To prevent passing an object containing sensitive data, see [`taintObjectReference`](/reference/react/experimental_taintObjectReference).

</Intro>

<InlineToc />

---

## Reference {/_reference_/}

### `taintUniqueValue(message, lifetime, value)` {/_taintuniquevalue_/}

Call `taintUniqueValue` with a password, token, key or hash to register it with React as something that should not be allowed to be passed to the Client as is:

```js
import { experimental_taintUniqueValue } from 'react'

experimental_taintUniqueValue(
  'Do not pass secret keys to the client.',
  process,
  process.env.SECRET_KEY
)
```

[See more examples below.](#usage)

#### Parameters {/_parameters_/}

- `message`: The message you want to display if `value` is passed to a Client Component. This message will be displayed as a part of the Error that will be thrown if `value` is passed to a Client Component.

- `lifetime`: Any object that indicates how long `value` should be tainted. `value` will be blocked from being sent to any Client Component while this object still exists. For example, passing `globalThis` blocks the value for the lifetime of an app. `lifetime` is typically an object whose properties contains `value`.

- `value`: A string, bigint or TypedArray. `value` must be a unique sequence of characters or bytes with high entropy such as a cryptographic token, private key, hash, or a long password. `value` will be blocked from being sent to any Client Component.

#### Returns {/_returns_/}

`experimental_taintUniqueValue` returns `undefined`.

#### Caveats {/_caveats_/}

- Deriving new values from tainted values can compromise tainting protection. New values created by uppercasing tainted values, concatenating tainted string values into a larger string, converting tainted values to base64, substringing tainted values, and other similar transformations are not tainted unless you explicitly call `taintUniqueValue` on these newly created values.
- Do not use `taintUniqueValue` to protect low-entropy values such as PIN codes or phone numbers. If any value in a request is controlled by an attacker, they could infer which value is tainted by enumerating all possible values of the secret.

---

## Usage {/_usage_/}

### Prevent a token from being passed to Client Components {/_prevent-a-token-from-being-passed-to-client-components_/}

To ensure that sensitive information such as passwords, session tokens, or other unique values do not inadvertently get passed to Client Components, the `taintUniqueValue` function provides a layer of protection. When a value is tainted, any attempt to pass it to a Client Component will result in an error.

The `lifetime` argument defines the duration for which the value remains tainted. For values that should remain tainted indefinitely, objects like [`globalThis`](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/globalThis) or `process` can serve as the `lifetime` argument. These objects have a lifespan that spans the entire duration of your app's execution.

```js
import { experimental_taintUniqueValue } from 'react'

experimental_taintUniqueValue(
  'Do not pass a user password to the client.',
  globalThis,
  process.env.SECRET_KEY
)
```

If the tainted value's lifespan is tied to a object, the `lifetime` should be the object that encapsulates the value. This ensures the tainted value remains protected for the lifetime of the encapsulating object.

```js
import { experimental_taintUniqueValue } from 'react'

export async function getUser(id) {
  const user = await db`SELECT * FROM users WHERE id = ${id}`
  experimental_taintUniqueValue(
    'Do not pass a user session token to the client.',
    user,
    user.session.token
  )
  return user
}
```

In this example, the `user` object serves as the `lifetime` argument. If this object gets stored in a global cache or is accessible by another request, the session token remains tainted.

<Pitfall>

**Do not rely solely on tainting for security.** Tainting a value doesn't block every possible derived value. For example, creating a new value by upper casing a tainted string will not taint the new value.

```js
import { experimental_taintUniqueValue } from 'react'

const password = 'correct horse battery staple'

experimental_taintUniqueValue(
  'Do not pass the password to the client.',
  globalThis,
  password
)

const uppercasePassword = password.toUpperCase() // `uppercasePassword` is not tainted
```

In this example, the constant `password` is tainted. Then `password` is used to create a new value `uppercasePassword` by calling the `toUpperCase` method on `password`. The newly created `uppercasePassword` is not tainted.

Other similar ways of deriving new values from tainted values like concatenating it into a larger string, converting it to base64, or returning a substring create untained values.

Tainting only protects against simple mistakes like explicitly passing secret values to the client. Mistakes in calling the `taintUniqueValue` like using a global store outside of React, without the corresponding lifetime object, can cause the tainted value to become untainted. Tainting is a layer of protection; a secure app will have multiple layers of protection, well designed APIs, and isolation patterns.

</Pitfall>

<DeepDive>

#### Using `server-only` and `taintUniqueValue` to prevent leaking secrets {/_using-server-only-and-taintuniquevalue-to-prevent-leaking-secrets_/}

If you're running a Server Components environment that has access to private keys or passwords such as database passwords, you have to be careful not to pass that to a Client Component.

```js
export async function Dashboard(props) {
  // DO NOT DO THIS
  return <Overview password={process.env.API_PASSWORD} />
}
```

```js
"use client";

import {useEffect} from '...'

export async function Overview({ password }) {
  useEffect(() => {
    const headers = { Authorization: password };
    fetch(url, { headers }).then(...);
  }, [password]);
  ...
}
```

This example would leak the secret API token to the client. If this API token can be used to access data this particular user shouldn't have access to, it could lead to a data breach.

[comment]: <> (TODO: Link to `server-only` docs once they are written)

Ideally, secrets like this are abstracted into a single helper file that can only be imported by trusted data utilities on the server. The helper can even be tagged with [`server-only`](https://www.npmjs.com/package/server-only) to ensure that this file isn't imported on the client.

```js
import 'server-only'

export function fetchAPI(url) {
  const headers = { Authorization: process.env.API_PASSWORD }
  return fetch(url, { headers })
}
```

Sometimes mistakes happen during refactoring and not all of your colleagues might know about this.
To protect against this mistakes happening down the line we can "taint" the actual password:

```js
import "server-only";
import {experimental_taintUniqueValue} from 'react';

experimental_taintUniqueValue(
  'Do not pass the API token password to the client. ' +
    'Instead do all fetches on the server.'
  process,
  process.env.API_PASSWORD
);
```

Now whenever anyone tries to pass this password to a Client Component, or send the password to a Client Component with a Server Function, an error will be thrown with message you defined when you called `taintUniqueValue`.

</DeepDive>

---
