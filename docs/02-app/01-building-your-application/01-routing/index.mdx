---
title: Routing Fundamentals
nav_title: Routing
description: Learn the fundamentals of routing for front-end applications.
---

The skeleton of every application is routing. This page will introduce you to the **fundamental concepts** of routing for the web and how to handle routing in Next.js.

## Terminology

First, you will see these terms being used throughout the documentation. Here's a quick reference:

<Image
  alt="Terminology for Component Tree"
  srcLight="/docs/light/terminology-component-tree.png"
  srcDark="/docs/dark/terminology-component-tree.png"
  width="1600"
  height="832"
/>

- **Tree:** A convention for visualizing a hierarchical structure. For example, a component tree with parent and children components, a folder structure, etc.
- **Subtree:** Part of a tree, starting at a new root (first) and ending at the leaves (last).
- **Root**: The first node in a tree or subtree, such as a root layout.
- **Leaf:** Nodes in a subtree that have no children, such as the last segment in a URL path.

<Image
  alt="Terminology for URL Anatomy"
  srcLight="/docs/light/terminology-url-anatomy.png"
  srcDark="/docs/dark/terminology-url-anatomy.png"
  width="1600"
  height="371"
/>

- **URL Segment:** Part of the URL path delimited by slashes.
- **URL Path:** Part of the URL that comes after the domain (composed of segments).

## The `app` Router

In version 13, Next.js introduced a new **App Router** built on [React Server Components](/docs/app/building-your-application/rendering/server-components), which supports shared layouts, nested routing, loading states, error handling, and more.

The App Router works in a new directory named `app`. The `app` directory works alongside the `pages` directory to allow for incremental adoption. This allows you to opt some routes of your application into the new behavior while keeping other routes in the `pages` directory for previous behavior. If your application uses the `pages` directory, please also see the [Pages Router](/docs/pages/building-your-application/routing) documentation.

> **Good to know**: The App Router takes priority over the Pages Router. Routes across directories should not resolve to the same URL path and will cause a build-time error to prevent a conflict.

<Image
  alt="Next.js App Directory"
  srcLight="/docs/light/next-router-directories.png"
  srcDark="/docs/dark/next-router-directories.png"
  width="1600"
  height="444"
/>

By default, components inside `app` are [React Server Components](/docs/app/building-your-application/rendering/server-components). This is a performance optimization and allows you to easily adopt them, and you can also use [Client Components](/docs/app/building-your-application/rendering/client-components).

> **Recommendation:** Check out the [Server](/docs/app/building-your-application/rendering/server-components) page if you're new to Server Components.

## Roles of Folders and Files

Next.js uses a file-system based router where:

- **Folders** are used to define routes. A route is a single path of nested folders, following the file-system hierarchy from the **root folder** down to a final **leaf folder** that includes a `page.js` file. See [Defining Routes](/docs/app/building-your-application/routing/defining-routes).
- **Files** are used to create UI that is shown for a route segment. See [special files](#file-conventions).

## Route Segments

Each folder in a route represents a **route segment**. Each route segment is mapped to a corresponding **segment** in a **URL path**.

<Image
  alt="How Route Segments Map to URL Segments"
  srcLight="/docs/light/route-segments-to-path-segments.png"
  srcDark="/docs/dark/route-segments-to-path-segments.png"
  width="1600"
  height="594"
/>

## Nested Routes

To create a nested route, you can nest folders inside each other. For example, you can add a new `/dashboard/settings` route by nesting two new folders in the `app` directory.

The `/dashboard/settings` route is composed of three segments:

- `/` (Root segment)
- `dashboard` (Segment)
- `settings` (Leaf segment)

## File Conventions

Next.js provides a set of special files to create UI with specific behavior in nested routes:

|                                                                                       |                                                                                                |
| ------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| [`layout`](/docs/app/building-your-application/routing/pages-and-layouts#layouts)     | Shared UI for a segment and its children                                                       |
| [`page`](/docs/app/building-your-application/routing/pages-and-layouts#pages)         | Unique UI of a route and make routes publicly accessible                                       |
| [`loading`](/docs/app/building-your-application/routing/loading-ui-and-streaming)     | Loading UI for a segment and its children                                                      |
| [`not-found`](/docs/app/api-reference/file-conventions/not-found)                     | Not found UI for a segment and its children                                                    |
| [`error`](/docs/app/building-your-application/routing/error-handling)                 | Error UI for a segment and its children                                                        |
| [`global-error`](/docs/app/building-your-application/routing/error-handling)          | Global Error UI                                                                                |
| [`route`](/docs/app/building-your-application/routing/route-handlers)                 | Server-side API endpoint                                                                       |
| [`template`](/docs/app/building-your-application/routing/pages-and-layouts#templates) | Specialized re-rendered Layout UI                                                              |
| [`default`](/docs/app/api-reference/file-conventions/default)                         | Fallback UI for [Parallel Routes](/docs/app/building-your-application/routing/parallel-routes) |

> **Good to know**: `.js`, `.jsx`, or `.tsx` file extensions can be used for special files.

## Component Hierarchy

The React components defined in special files of a route segment are rendered in a specific hierarchy:

- `layout.js`
- `template.js`
- `error.js` (React error boundary)
- `loading.js` (React suspense boundary)
- `not-found.js` (React error boundary)
- `page.js` or nested `layout.js`

<Image
  alt="Component Hierarchy for File Conventions"
  srcLight="/docs/light/file-conventions-component-hierarchy.png"
  srcDark="/docs/dark/file-conventions-component-hierarchy.png"
  width="1600"
  height="643"
/>

In a nested route, the components of a segment will be nested **inside** the components of its parent segment.

<Image
  alt="Nested File Conventions Component Hierarchy"
  srcLight="/docs/light/nested-file-conventions-component-hierarchy.png"
  srcDark="/docs/dark/nested-file-conventions-component-hierarchy.png"
  width="1600"
  height="863"
/>

## Colocation

In addition to special files, you have the option to colocate your own files (e.g. components, styles, tests, etc) inside folders in the `app` directory.

This is because while folders define routes, only the contents returned by `page.js` or `route.js` are publicly addressable.

<Image
  alt="An example folder structure with colocated files"
  srcLight="/docs/light/project-organization-colocation.png"
  srcDark="/docs/dark/project-organization-colocation.png"
  width="1600"
  height="1011"
/>

Learn more about [Project Organization and Colocation](/docs/app/building-your-application/routing/colocation).

## Advanced Routing Patterns

The App Router also provides a set of conventions to help you implement more advanced routing patterns. These include:

- [Parallel Routes](/docs/app/building-your-application/routing/parallel-routes): Allow you to simultaneously show two or more pages in the same view that can be navigated independently. You can use them for split views that have their own sub-navigation. E.g. Dashboards.
- [Intercepting Routes](/docs/app/building-your-application/routing/intercepting-routes): Allow you to intercept a route and show it in the context of another route. You can use these when keeping the context for the current page is important. E.g. Seeing all tasks while editing one task or expanding a photo in a feed.

These patterns allow you to build richer and more complex UIs, democratizing features that were historically complex for small teams and individual developers to implement.

## Next Steps

Now that you understand the fundamentals of routing in Next.js, follow the links below to create your first routes:
