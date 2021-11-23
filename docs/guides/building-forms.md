---
description: Forms are an essential part of the web. This guide will demonstrate how to build a performant, accessible form with Next.js while teaching the best practices for HTML & React forms along the way. Learn more here.
---

## Why Next.js?

React is a library for client-side applications. If you need to fetch dynamic data from a server, you have to set up (or connect to) an external API. With Next.js, you can use **both the client and the server** in the same application. For example, [API routes](https://nextjs.org/docs/api-routes/introduction) provide a straight-forward solution for connecting with external services, APIs, or even persisting to a database.

This makes Next.js a **compelling, all-in-one solution for creating forms**.

## HTML Forms

A standard HTML form is a convenient way to make an HTTP request to send data to a server (either your own server or external service). In the example below, clicking "Register" will make a POST request to the specified URL.

```
<form action="http://www.acme.com/register" method="POST">
  <label for="name">Name</label>
  <input id="name" type="text" autocomplete="name" required />
  <button type="submit">Register</button>
</form>
```

Before we proceed further, it's crucial to understand how to create an accessible HTML form.

- Take advantage of HTML attributes like [required](https://www.w3schools.com/tags/att_input_required.asp), [autocomplete](https://developer.mozilla.org/en-US/docs/Web/HTML/Attributes/autocomplete), and [type](https://www.w3schools.com/tags/att_type.asp).
- You should use a native `<select>` element for optimal support across browsers and devices.
- All elements in a form should have an [associated label](https://www.w3.org/WAI/tutorials/forms/labels/) with matching `for` and `id` values.
- Form `id` attribute values must be unique for each element.

Depending on the size and complexity of your form, there might be more steps necessary to ensure an accessible experience. Please review [these concepts](https://www.w3.org/WAI/tutorials/forms/) if so.

## React forms

We can extend our knowledge of HTML forms and bring them into React (using [JSX](https://reactjs.org/docs/introducing-jsx.html)). For this example, we'll be using an uncontrolled component. Rather than writing an event handler for every state update, we use a reference to the DOM element to retrieve or modify values. For more information on controlled and [uncontrolled components](https://reactjs.org/docs/uncontrolled-components.html), see the [official React docs](https://reactjs.org/docs/uncontrolled-components.html).

By default, submitting an HTML form will redirect the browser. In most cases with React forms, we want to handle the form submission and perform some additional action (e.g. call an API). Let's convert the HTML form above into a React component.

```
function Form() {
  const registerUser = event => {
    event.preventDefault() // don't redirect the page
    // where we'll add our form logic
  }

  return (
    <form onSubmit={registerUser}>
      <label htmlFor="name">Name</label>
      <input id="name" type="text" autoComplete="name" required />
      <button type="submit">Register</button>
    </form>
  )
}
```

Here's what's changed:

- The form is now placed inside a React component and rendered using JSX.
- The `for` attribute was changed to `htmlFor` ([for is reserved in JavaScript](https://reactjs.org/docs/dom-elements.html)).
- The `autocomplete` attribute was changed to `autoComplete` ([DOM attributes should be camelCase](https://reactjs.org/docs/dom-elements.html)).
- We added an event handler for submitting the form (the function `registerUser`).
- We no longer need the `action` or `method` of the form, because we're handling the logic ourselves.
- By using `event.preventDefault()`, we override the default browser behavior of redirecting the page.

Next, let's update `registerUser` to call an external API. For example, we might call a service like [Zapier](https://zapier.com/) to forward a JSON body and add it to a Google Sheet.

```function Form() {
  const registerUser = async event => {
    event.preventDefault()

    const res = await fetch(
      'https://hooks.zapier.com/hooks/catch/123456/abcde',
      {
        body: JSON.stringify({
          name: event.target.name.value
        }),
        headers: {
          'Content-Type': 'application/json'
        },
        method: 'POST'
      }
    )

    const result = await res.json()
    // result.user => 'Ada Lovelace'
  }

  return (
    <form onSubmit={registerUser}>
      <label htmlFor="name">Name</label>
      <input id="name" name="name" type="text" autoComplete="name" required />
      <button type="submit">Register</button>
    </form>
  )
}
```

Here's what's changed:

- We added a `name` attribute to the `input` so we can retrieve the value in `registerUser`.
- We call the API endpoint asynchronously using `async` / `await` to wait for the response.
- The value of `name` is included in the HTTP body as JSON.
- After getting a response, we can access the JSON value (if necessary).

We now have a fully functioning React form. Now, let's explore how Next.js can allow us to write our own API endpoints.

**Bonus**: We could use `event.target.reset()` to [clear our form](https://developer.mozilla.org/en-US/docs/Web/API/HTMLFormElement/reset), if desired.

## Using Next.js

As previously mentioned, we can use both the client and the server in a Next.js application. Now that we have our React form on the client-side, let's create an [API Route](https://nextjs.org/docs/api-routes/introduction) for us to send our form data.

First, create a new file at `pages/api/register.js`. Any file inside the [pages folder](https://nextjs.org/docs/basic-features/pages) (e.g. `pages/api`) is mapped to `/api/*` and will be treated as an API endpoint instead of a Next.js [page](https://nextjs.org/docs/basic-features/pages).

```
// pages/api/register.js

export default function handler(req, res) {
  res.status(200).json({ user: 'Ada Lovelace' })
}
```

After [starting our application locally](https://nextjs.org/docs/getting-started`) with `next dev` and visiting `localhost:3000/api/register`, we should be able to see the JSON response above with a status code of `200`. Next, let's call this API route from inside our form instead of the external API endpoint.

```
function Form() {
  const registerUser = async event => {
    event.preventDefault()

    const res = await fetch('/api/register', {
      body: JSON.stringify({
        name: event.target.name.value
      }),
      headers: {
        'Content-Type': 'application/json'
      },
      method: 'POST'
    })

    const result = await res.json()
    // result.user => 'Ada Lovelace'
  }

  return (
    <form onSubmit={registerUser}>
      <label htmlFor="name">Name</label>
      <input id="name" name="name" type="text" autoComplete="name" required />
      <button type="submit">Register</button>
    </form>
  )
}
```

API Routes [do not specify CORS headers](https://developer.mozilla.org/en-US/docs/Web/HTTP/CORS), meaning they are same-origin only by default. Inside of our API Route, we could save the user to our database or communicate with any external services.

Since API Routes are on the server, we're able to use sensitive values (like API keys) through [Environment Variables](https://nextjs.org/docs/basic-features/environment-variables) without exposing them to the client. This is critical for the security of your application.

## Conclusion

Next.js provides you an all-in-one solution for creating forms. Use React on the client-side for your interactive logic and use API Routes to securely access external services. If you want to learn more about Next.js, check out our [Learn course](https://nextjs.org/learn/basics/create-nextjs-app).
