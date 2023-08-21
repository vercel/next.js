---
title: Project Organization and File Colocation
nav_title: Project Organization
description: Learn how to organize your Next.js project and colocate files.
related:
  links:
    - app/building-your-application/routing/defining-routes
    - app/building-your-application/routing/route-groups
    - app/building-your-application/configuring/src-directory
    - app/building-your-application/configuring/absolute-imports-and-module-aliases
---

Apart from [routing folder and file conventions](/docs/getting-started/project-structure#app-routing-conventions), Next.js is **unopinionated** about how you organize and colocate your project files.

This page shares default behavior and features you can use to organize your project.

- [Safe colocation by default](#safe-colocation-by-default)
- [Project organization features](#project-organization-features)
- [Project organization strategies](#project-organization-strategies)

## Safe colocation by default

In the `app` directory, [nested folder hierarchy](/docs/app/building-your-application/routing#route-segments) defines route structure.

Each folder represents a route segment that is mapped to a corresponding segment in a URL path.

However, even though route structure is defined through folders, a route is **not publicly accessible** until a `page.js` or `route.js` file is added to a route segment.

<Image
  alt="A diagram showing how a route is not publicly accessible until a page.js or route.js file is added to a route segment."
  srcLight="/docs/light/project-organization-not-routable.png"
  srcDark="/docs/dark/project-organization-not-routable.png"
  width="1600"
  height="444"
/>

And, even when a route is made publicly accessible, only the **content returned** by `page.js` or `route.js` is sent to the client.

<Image
  alt="A diagram showing how page.js and route.js files make routes publicly accessible."
  srcLight="/docs/light/project-organization-routable.png"
  srcDark="/docs/dark/project-organization-routable.png"
  width="1600"
  height="687"
/>

This means that **project files** can be **safely colocated** inside route segments in the `app` directory without accidentally being routable.

<Image
  alt="A diagram showing colocated project files are not routable even when a segment contains a page.js or route.js file."
  srcLight="/docs/light/project-organization-colocation.png"
  srcDark="/docs/dark/project-organization-colocation.png"
  width="1600"
  height="1011"
/>

> **Good to know**:
>
> - This is different from the `pages` directory, where any file in `pages` is considered a route.
> - While you **can** colocate your project files in `app` you don't **have** to. If you prefer, you can [keep them outside the `app` directory](#store-project-files-outside-of-app).

## Project organization features

Next.js provides several features to help you organize your project.

### Private Folders

Private folders can be created by prefixing a folder with an underscore: `_folderName`

This indicates the folder is a private implementation detail and should not be considered by the routing system, thereby **opting the folder and all its subfolders** out of routing.

<Image
  alt="An example folder structure using private folders"
  srcLight="/docs/light/project-organization-private-folders.png"
  srcDark="/docs/dark/project-organization-private-folders.png"
  width="1600"
  height="849"
/>

Since files in the `app` directory can be [safely colocated by default](#safe-colocation-by-default), private folders are not required for colocation. However, they can be useful for:

- Separating UI logic from routing logic.
- Consistently organizing internal files across a project and the Next.js ecosystem.
- Sorting and grouping files in code editors.
- Avoiding potential naming conflicts with future Next.js file conventions.

> **Good to know**
>
> - While not a framework convention, you might also consider marking files outside private folders as "private" using the same underscore pattern.
> - You can create URL segments that start with an underscore by prefixing the folder name with `%5F` (the URL-encoded form of an underscore): `%5FfolderName`.
> - If you don't use private folders, it would be helpful to know Next.js [special file conventions](/docs/getting-started/project-structure#routing-files) to prevent unexpected naming conflicts.

### Route Groups

Route groups can be created by wrapping a folder in parenthesis: `(folderName)`

This indicates the folder is for organizational purposes and should **not be included** in the route's URL path.

<Image
  alt="An example folder structure using route groups"
  srcLight="/docs/light/project-organization-route-groups.png"
  srcDark="/docs/dark/project-organization-route-groups.png"
  width="1600"
  height="849"
/>

Route groups are useful for:

- [Organizing routes into groups](/docs/app/building-your-application/routing/route-groups#organize-routes-without-affecting-the-url-path) e.g. by site section, intent, or team.
- Enabling nested layouts in the same route segment level:
  - [Creating multiple nested layouts in the same segment, including multiple root layouts](/docs/app/building-your-application/routing/route-groups#creating-multiple-root-layouts)
  - [Adding a layout to a subset of routes in a common segment](/docs/app/building-your-application/routing/route-groups#opting-specific-segments-into-a-layout)

### `src` Directory

Next.js supports storing application code (including `app`) inside an optional [`src` directory](/docs/app/building-your-application/configuring/src-directory). This separates application code from project configuration files which mostly live in the root of a project.

<Image
  alt="An example folder structure with the `src` directory"
  srcLight="/docs/light/project-organization-src-directory.png"
  srcDark="/docs/dark/project-organization-src-directory.png"
  width="1600"
  height="687"
/>

### Module Path Aliases

Next.js supports [Module Path Aliases](/docs/app/building-your-application/configuring/absolute-imports-and-module-aliases) which make it easier to read and maintain imports across deeply nested project files.

```jsx filename="app/dashboard/settings/analytics/page.js"
// before
import { Button } from '../../../components/button'

// after
import { Button } from '@/components/button'
```

## Project organization strategies

There is no "right" or "wrong" way when it comes to organizing your own files and folders in a Next.js project.

The following section lists a very high-level overview of common strategies. The simplest takeaway is to choose a strategy that works for you and your team and be consistent across the project.

> **Good to know**: In our examples below, we're using `components` and `lib` folders as generalized placeholders, their naming has no special framework significance and your projects might use other folders like `ui`, `utils`, `hooks`, `styles`, etc.

### Store project files outside of `app`

This strategy stores all application code in shared folders in the **root of your project** and keeps the `app` directory purely for routing purposes.

<Image
  alt="An example folder structure with project files outside of app"
  srcLight="/docs/light/project-organization-project-root.png"
  srcDark="/docs/dark/project-organization-project-root.png"
  width="1600"
  height="849"
/>

### Store project files in top-level folders inside of `app`

This strategy stores all application code in shared folders in the **root of the `app` directory**.

<Image
  alt="An example folder structure with project files inside app"
  srcLight="/docs/light/project-organization-app-root.png"
  srcDark="/docs/dark/project-organization-app-root.png"
  width="1600"
  height="849"
/>

### Split project files by feature or route

This strategy stores globally shared application code in the root `app` directory and **splits** more specific application code into the route segments that use them.

<Image
  alt="An example folder structure with project files split by feature or route"
  srcLight="/docs/light/project-organization-app-root-split.png"
  srcDark="/docs/dark/project-organization-app-root-split.png"
  width="1600"
  height="1011"
/>
