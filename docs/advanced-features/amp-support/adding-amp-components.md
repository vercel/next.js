---
description: Add components from the AMP community to AMP pages, and make your pages more interactive.
---

# Adding AMP Components

The AMP community provide [many components](https://amp.dev/documentation/components/) to make AMP pages more interactive. You can add these components to your page by using `next/head`, as in the following example:

```jsx
import Head from 'next/head'

export const config = { amp: true }

function MyAmpPage() {
  const date = new Date()

  return (
    <div>
      <Head>
        <script
          async
          key="amp-timeago"
          custom-element="amp-timeago"
          src="https://cdn.ampproject.org/v0/amp-timeago-0.1.js"
        />
      </Head>

      <p>Some time: {date.toJSON()}</p>
      <amp-timeago
        width="0"
        height="15"
        datetime={date.toJSON()}
        layout="responsive"
      >
        .
      </amp-timeago>
    </div>
  )
}

export default MyAmpPage
```

The above example uses the [`amp-timeago`](https://amp.dev/documentation/components/amp-timeago/?format=websites) component.
