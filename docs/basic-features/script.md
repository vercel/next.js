---
description: Next.js supports built-in third-party Script loading optimization
---

# Script Component

Since version **10.2**, Next.js has built-in Script component.

Example of usage

```js
import Script from 'next/script'

// Before
<script
  async
  src="https://www.google-analytics.com/analytics.js"
/>

// After
<Script
  src="https://www.google-analytics.com/analytics.js"
/>
```

Three loading strategies will be initially supported for wrapping 3Ps:

- before-interactive
  - script is fetched and executed _before_ page is interactive (i.e. before self-bundled javascript is executed)
  - script is injected in SSR’s HTML - similar to self-bundled JS
- after-interactive (**default**)
  - script is fetched and executed _after_ page is interactive (i.e. after self-bundled javascript is executed)
  - script is injected during hydration and will execute soon after hydration
- lazy-onload
  - script is injected at onload, and will execute in a subsequent idle period (using rIC)

NOTE: above strategies work the same for inline scripts wrapped with ScriptLoader.

## Which 3Ps to wrap with Script Loader

We recommend the following Script Loader strategies for these categories of 3Ps

| Loading strategy   | 3P categories                                                                                |
| ------------------ | -------------------------------------------------------------------------------------------- |
| before-interactive | polyfill.io<br>Bot detection, security & authentication<br>User consent management (GDPR)    |
| after-interactive  | Tag-managers<br>Analytics                                                                    |
| lazy-onload        | customer relationship management eg. Google feedback, chat support widget<br>social networks |
