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
