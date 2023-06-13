---
title: Route Groups
description: Route Groups can be used to partition your Next.js application into different sections.
---

In the `app` directory, nested folders are normally mapped to URL paths. However, you can mark a folder as a **Route Group** to prevent the folder from being included in the route's URL path.

This allows you to organize your route segments and project files into logical groups without affecting the URL path structure.

Route groups are useful for:

- [Organizing routes into groups](#organize-routes-without-affecting-the-url-path) e.g. by site section, intent, or team.
- Enabling [nested layouts](/docs/app/building-your-application/routing/pages-and-layouts) in the same route segment level:
  - [Creating multiple nested layouts in the same segment, including multiple root layouts](#creating-multiple-root-layouts)
  - [Adding a layout to a subset of routes in a common segment](#opting-specific-segments-into-a-layout)

## Convention

A route group can be created by wrapping a folder's name in parenthesis: `(folderName)`

## Examples

### Organize routes without affecting the URL path

To organize routes without affecting the URL, create a group to keep related routes together. The folders in parenthesis will be omitted from the URL (e.g. `(marketing)` or `(shop)`).

<Image
  alt="Organizing Routes with Route Groups"
  srcLight="/docs/light/route-group-organisation.png"
  srcDark="/docs/dark/route-group-organisation.png"
  width="1600"
  height="930"
/>

Even though routes inside `(marketing)` and `(shop)` share the same URL hierarchy, you can create a different layout for each group by adding a `layout.js` file inside their folders.

<Image
  alt="Route Groups with Multiple Layouts"
  srcLight="/docs/light/route-group-multiple-layouts.png"
  srcDark="/docs/dark/route-group-multiple-layouts.png"
  width="1600"
  height="768"
/>

### Opting specific segments into a layout

To opt specific routes into a layout, create a new route group (e.g. `(shop)`) and move the routes that share the same layout into the group (e.g. `account` and `cart`). The routes outside of the group will not share the layout (e.g. `checkout`).

<Image
  alt="Route Groups with Opt-in Layouts"
  srcLight="/docs/light/route-group-opt-in-layouts.png"
  srcDark="/docs/dark/route-group-opt-in-layouts.png"
  width="1600"
  height="930"
/>

### Creating multiple root layouts

To create multiple [root layouts](/docs/app/building-your-application/routing/pages-and-layouts#root-layout-required), remove the top-level `layout.js` file, and add a `layout.js` file inside each route groups. This is useful for partitioning an application into sections that have a completely different UI or experience. The `<html>` and `<body>` tags need to be added to each root layout.

<Image
  alt="Route Groups with Multiple Root Layouts"
  srcLight="/docs/light/route-group-multiple-root-layouts.png"
  srcDark="/docs/dark/route-group-multiple-root-layouts.png"
  width="1600"
  height="687"
/>

In the example above, both `(marketing)` and `(shop)` have their own root layout.

---

> **Good to know**:
>
> - The naming of route groups has no special significance other than for organization. They do not affect the URL path.
> - Routes that include a route group **should not** resolve to the same URL path as other routes. For example, since route groups don't affect URL structure, `(marketing)/about/page.js` and `(shop)/about/page.js` would both resolve to `/about` and cause an error.
> - If you use multiple root layouts without a top-level `layout.js` file, your home `page.js` file should be defined in one of the route groups, For example: `app/(marketing)/page.js`.
> - Navigating **across multiple root layouts** will cause a **full page load** (as opposed to a client-side navigation). For example, navigating from `/cart` that uses `app/(shop)/layout.js` to `/blog` that uses `app/(marketing)/layout.js` will cause a full page load. This **only** applies to multiple root layouts.
