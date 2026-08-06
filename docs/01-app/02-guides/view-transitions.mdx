---
title: Designing view transitions
description: Learn how to use view transitions to communicate meaning during navigation, loading, and content changes in a Next.js app.
nav_title: View transitions
---

In web apps, route changes replace the entire page at once. One set of elements disappears, another appears, with no visual connection between them. A user selects a photo thumbnail to view it in detail on another page. They are the same image, but nothing on screen communicates that.

Apps that need these transitions typically rely on complex animation libraries that manage mount/unmount lifecycles, track element positions across routes, and coordinate timing manually, to animate how elements enter, exit, and move between states.

React's `<ViewTransition>` component integrates with the browser's [View Transitions API](https://developer.mozilla.org/en-US/docs/Web/API/View_Transition_API) to handle this declaratively. You name the elements that should persist, and the browser animates between their old and new positions.

This guide walks through four patterns that cover the most common cases: morphing shared elements, animating loading states, adding directional navigation, and crossfading content within the same route.

## Use the vercel-react-view-transitions skill

The [`vercel-react-view-transitions`](https://github.com/vercel-labs/agent-skills/tree/main/skills/react-view-transitions) skill teaches a coding agent the patterns in this guide, plus the CSS recipes and troubleshooting for applying them to an existing app.

Install the skill:

```bash filename="Terminal"
npx skills add https://github.com/vercel-labs/agent-skills --skill vercel-react-view-transitions
```

Then give the agent this prompt:

```prompt
Add view transitions to this app using the vercel-react-view-transitions skill.
```

To apply the patterns yourself, follow the walkthrough below.

## Example

As an example, we'll build a photography gallery called _Frames_.

We'll start by morphing a thumbnail into a hero image (shared elements), then animate the loading skeleton into real content (Suspense reveals), add directional slides for forward and back navigation (route transitions), and finish with crossfades for switching between photographer tabs (same-route transitions).

You can find the resources used in this example here:

- [Demo](https://react-view-transitions-demo.labs.vercel.dev)
- [Code](https://github.com/vercel-labs/react-view-transitions-demo)

View transitions work in the App Router with no configuration. The App Router uses [React canary releases](https://react.dev/blog/2023/05/03/react-canaries), which contain all stable React 19 changes as well as newer features like `ViewTransition`. You do not need to install `react@canary` yourself.

> [!NOTE]
> React's integration uses newer View Transitions API features (transition types and `view-transition-class`), available in Chromium 125+ and recent Safari and Firefox versions. Some animations may behave differently in Safari. Without browser support, your application works normally; the transitions do not animate.

Import the `ViewTransition` component from React:

```tsx
import { ViewTransition } from 'react'
```

`<ViewTransition>` animations are activated by [Transitions](https://react.dev/reference/react/useTransition), [`<Suspense>`](https://react.dev/reference/react/Suspense), and [`useDeferredValue`](https://react.dev/reference/react/useDeferredValue). Regular `setState` calls do not trigger them. In Next.js, route navigations are transitions, so `<ViewTransition>` animations activate automatically during navigation.

### Step 1: Morph a thumbnail into a hero image

The gallery displays photos in a grid. Clicking a photo opens a detail page with a larger version of the same image. Without transitions, the thumbnail disappears and the hero appears. Nothing connects them visually. The user has to scan the detail page to confirm they clicked the right photo.

In motion design, when an object persists across a cut, it communicates continuity. The viewer understands they are looking at the same thing, not a replacement. This is the most important transition pattern: **shared element morphing**.

Wrap both the grid thumbnail and the detail hero in `<ViewTransition>` with the same `name`:

```tsx filename="components/photo-grid.tsx"
import { ViewTransition } from 'react'
import Image from 'next/image'
import Link from 'next/link'

function PhotoGrid({ photos }) {
  return (
    <div className="grid grid-cols-3 gap-3">
      {photos.map((photo) => (
        <Link key={photo.id} href={`/photo/${photo.id}`}>
          <ViewTransition name={`photo-${photo.id}`}>
            <Image src={photo.src} alt={photo.title} />
          </ViewTransition>
        </Link>
      ))}
    </div>
  )
}
```

```tsx filename="app/photo/[id]/photo-content.tsx"
import { ViewTransition } from 'react'
import Image from 'next/image'

async function PhotoContent({ id }) {
  const photo = await getPhoto(id)

  return (
    <ViewTransition name={`photo-${photo.id}`}>
      <div style={{ position: 'relative', aspectRatio: '3 / 2' }}>
        <Image src={photo.src} alt={photo.title} fill />
      </div>
    </ViewTransition>
  )
}
```

The `name` prop creates identity. React finds elements with the same name on the old and new pages, then animates between their size and position automatically. No additional props are needed for the morph to work.

If we click a thumbnail now, the image scales and repositions from its grid cell to the hero slot. Navigating back reverses the morph. The user sees one object moving, not two objects swapping.

The morph plays when the destination content renders in the same commit as the navigation, which is the case with prefetched (cached) pages. If the destination suspends into a fallback first, no pair forms, and the content animates with its enter animation instead when it arrives.

#### Customizing the morph animation

The morph works without any CSS. To customize it, add `share="morph"` together with `default="none"`. The `share` prop assigns the `morph` class to the view transition, which you can target with CSS pseudo-elements. For example, to soften the morph mid-flight with a [`blur`](https://developer.mozilla.org/en-US/docs/Web/CSS/filter-function/blur) keyframe:

```tsx
<ViewTransition name={`photo-${photo.id}`} share="morph" default="none">
  <Image src={photo.src} alt={photo.title} />
</ViewTransition>
```

Add the same props to both Step 1 snippets (`photo-grid.tsx` and `photo-content.tsx`). `default="none"` keeps each named image from running its own crossfade on every unrelated transition. Without it, every named `<ViewTransition>` animates whenever any transition runs on the page. When you add `default="none"` to a named pair, keep the explicit `share`. With `default="none"` and no `share` prop, the pair silently stops morphing.

```css filename="app/globals.css"
::view-transition-group(.morph) {
  animation-duration: 400ms;
}
::view-transition-image-pair(.morph) {
  animation-name: via-blur;
}
@keyframes via-blur {
  30% {
    filter: blur(3px);
  }
}
```

The blur hides pixel-level interpolation artifacts during the transition. At 400ms, the morph is slow enough to register but fast enough to feel direct.

### Step 2: Animate loading states with Suspense reveals

The photo detail page loads its content asynchronously. While data is in flight, a Suspense boundary shows a skeleton. When the data resolves, the skeleton is replaced by the real content.

Without a transition, the swap is instant. The skeleton vanishes and the content pops in.

In motion design, vertical direction encodes hierarchy. Content sliding up communicates arrival. Content sliding down communicates departure. The pair together creates a handoff: the placeholder yields to the real thing.

Wrap the Suspense fallback in a `ViewTransition` with an exit animation, and the content in a `ViewTransition` with an enter animation:

```tsx filename="app/photo/[id]/page.tsx"
import { Suspense, ViewTransition } from 'react'

export default async function PhotoPage({ params }) {
  const { id } = await params

  return (
    <Suspense
      fallback={
        <ViewTransition exit="slide-down" default="none">
          <PhotoContentSkeleton />
        </ViewTransition>
      }
    >
      <ViewTransition enter="slide-up" default="none">
        <PhotoContent id={id} />
      </ViewTransition>
    </Suspense>
  )
}
```

As in Step 1, `default="none"` prevents this `ViewTransition` from animating during unrelated transitions, like the shared element morph.

The CSS animations use asymmetric timing. The exit is fast (150ms). The enter fade is slower (210ms) and delayed until the exit completes, while its slide movement runs longer (400ms):

```css filename="app/globals.css"
:root {
  --duration-exit: 150ms;
  --duration-enter: 210ms;
  --duration-move: 400ms;
}

::view-transition-old(.slide-down) {
  animation:
    var(--duration-exit) ease-out both fade reverse,
    var(--duration-exit) ease-out both slide-y reverse;
}
::view-transition-new(.slide-up) {
  animation:
    var(--duration-enter) ease-in var(--duration-exit) both fade,
    var(--duration-move) ease-in both slide-y;
}

@keyframes fade {
  from {
    filter: blur(3px);
    opacity: 0;
  }
  to {
    filter: blur(0);
    opacity: 1;
  }
}
@keyframes slide-y {
  from {
    transform: translateY(10px);
  }
  to {
    transform: translateY(0);
  }
}
```

The asymmetry is deliberate. Old content should leave quickly so it does not compete for attention. New content should arrive more gently so the user has time to register it. The `var(--duration-exit)` delay on the enter fade means the new content waits for the old content to finish leaving before it becomes visible.

If we refresh the page, the skeleton slides down and fades out, and a moment later the real content slides up and fades in.

### Step 3: Add directional motion for navigation

The gallery now has morphing images and animated loading states. But navigating between pages still has no directional signal. Forward and back navigations look identical. The user cannot tell from the animation whether they moved deeper into the app or returned to a previous page.

In film and animation, horizontal direction encodes spatial position. Moving left means progressing forward (like turning a page in a left-to-right language). Moving right means going back. This convention is so ingrained that violating it feels disorienting.

Use the `transitionTypes` prop on `<Link>` to tag forward navigations:

```tsx filename="components/photo-grid.tsx"
<Link href={`/photo/${photo.id}`} transitionTypes={['nav-forward']}>
  {/* photo thumbnail */}
</Link>
```

The same pattern works for any navigation within the app. For example, previous/next arrows on a photo detail page can use `nav-back` and `nav-forward` to animate in the corresponding direction.

For links that return the user to a previous page, use `nav-back`:

```tsx filename="app/photo/[id]/page.tsx"
<Link href="/" transitionTypes={['nav-back']}>
  ← Gallery
</Link>
```

The transition type is not automatic. You decide which links are "forward" and which are "back" based on your app's navigation hierarchy.

Then wrap page content in a `ViewTransition` that maps transition types to directional animations:

```tsx filename="app/photo/[id]/page.tsx"
<ViewTransition
  enter={{
    'nav-forward': 'nav-forward',
    'nav-back': 'nav-back',
    default: 'none',
  }}
  exit={{
    'nav-forward': 'nav-forward',
    'nav-back': 'nav-back',
    default: 'none',
  }}
  default="none"
>
  {/* page content */}
</ViewTransition>
```

The `enter` and `exit` props accept an object keyed by transition type. When a navigation carries the `nav-forward` type, the exit animation slides old content left and the enter animation slides new content in from the right. The `default: "none"` ensures that transitions without a type (browser back/forward, `router.refresh()`, Suspense reveals) produce no directional animation.

Wrap every participating page the same way. For the gallery to slide out on forward navigation and back in on `nav-back`, its page needs the same wrapper. Put the wrapper in each `page.tsx`, not the layout. Layouts persist across navigations, so enter and exit never fire there:

```tsx filename="app/page.tsx"
<ViewTransition
  enter={{
    'nav-forward': 'nav-forward',
    'nav-back': 'nav-back',
    default: 'none',
  }}
  exit={{
    'nav-forward': 'nav-forward',
    'nav-back': 'nav-back',
    default: 'none',
  }}
  default="none"
>
  <PhotoGrid photos={photos} />
</ViewTransition>
```

The CSS for directional slides:

```css filename="app/globals.css"
::view-transition-old(.nav-forward) {
  --slide-offset: -60px;
  animation:
    150ms ease-in both fade reverse,
    400ms ease-in-out both slide reverse;
}
::view-transition-new(.nav-forward) {
  --slide-offset: 60px;
  animation:
    210ms ease-out 150ms both fade,
    400ms ease-in-out both slide;
}

::view-transition-old(.nav-back) {
  --slide-offset: 60px;
  animation:
    150ms ease-in both fade reverse,
    400ms ease-in-out both slide reverse;
}
::view-transition-new(.nav-back) {
  --slide-offset: -60px;
  animation:
    210ms ease-out 150ms both fade,
    400ms ease-in-out both slide;
}

@keyframes slide {
  from {
    translate: var(--slide-offset);
  }
  to {
    translate: 0;
  }
}
```

The 60px offset is enough to communicate direction without making the user track a fast-moving element across the screen.

#### Anchoring the header

During directional slides, the header should not move. A sliding header breaks the user's spatial anchor. They need one fixed reference point to understand that the _content_ moved, not the entire viewport.

Assign the header a `viewTransitionName` and suppress its animation in CSS:

```tsx filename="components/header.tsx"
<header style={{ viewTransitionName: 'site-header' }}>
  {/* navigation links */}
</header>
```

```css filename="app/globals.css"
::view-transition-group(site-header) {
  animation: none;
  z-index: 100;
}
::view-transition-old(site-header) {
  display: none;
}
::view-transition-new(site-header) {
  animation: none;
}
```

The `display: none` on the old snapshot prevents a flash where both old and new headers are briefly visible. The `z-index: 100` ensures the header renders above the sliding content.

If we navigate forward to a photo, content slides left. If we click the "← Gallery" link (tagged with `nav-back`), content slides right. The header stays fixed throughout both transitions.

Browser-initiated back navigations (the back button or swipe gestures) do not carry a transition type, so the directional slide does not play. The shared element morph from Step 1 still applies if both pages have matching `name` props.

#### Keeping the page interactive

While a transition runs, the `::view-transition` overlay captures pointer events, so clicks during the animation are lost. Let them pass through to the live page:

```css filename="app/globals.css"
::view-transition {
  pointer-events: none;
}
```

This restores interactivity for unnamed content. Hit-testing still skips named participants (like the anchored header) for the transition's duration, so keep transitions short and avoid naming elements the user clicks rapidly.

#### Respecting reduced motion

Directional slides simulate physical movement across the viewport. This is the most common trigger for motion sensitivity. Morphs, reveals, and crossfades carry less risk since they affect smaller areas or rely on opacity rather than position.

The simplest approach is to disable all animation durations:

```css filename="app/globals.css"
@media (prefers-reduced-motion: reduce) {
  ::view-transition-old(*),
  ::view-transition-new(*),
  ::view-transition-group(*) {
    animation-duration: 0s !important;
    animation-delay: 0s !important;
  }
}
```

Without animation, content swaps instantly, which is the browser's default behavior. A more refined approach would preserve crossfades and opacity transitions while removing positional movement. See ["No Motion Isn't Always prefers-reduced-motion"](https://css-tricks.com/nuking-motion-with-prefers-reduced-motion/) for more on this.

### Step 4: Crossfade content within the same route

The gallery has a photographer section with tabs. Each tab shows a different photographer's photos, but the route structure is the same: `/collection/[slug]`. Clicking between tabs does not feel like navigating to a new page. It feels like switching content within the same container.

A directional slide would be wrong here. Slides communicate "going to a new place." A crossfade communicates "same place, different content." The container persists (continuity), only the grid inside changes (swap).

Use a `ViewTransition` with `key` set to the current slug. When the key changes, React triggers a transition between the old and new content:

```tsx filename="app/collection/[slug]/page.tsx"
import { Suspense, ViewTransition } from 'react'

export default async function CollectionPage({ params }) {
  const { slug } = await params

  return (
    <Suspense fallback={<CollectionGridSkeleton />}>
      <ViewTransition
        key={slug}
        name="collection-content"
        share="auto"
        enter="auto"
        default="none"
      >
        <CollectionGrid slug={slug} />
      </ViewTransition>
    </Suspense>
  )
}
```

The `share="auto"` and `enter="auto"` props tell React to use its default crossfade animation. The `name` prop gives the container an identity so React knows what to animate. The navigation triggers the transition; the `key={slug}` change makes React treat the old and new content as an exit/enter pair (activating `share`) instead of an in-place update.

If we click between photographer tabs, the grid crossfades. The tab bar and surrounding layout do not move. Only the photo grid transitions between states.

## Next steps

You now know how to use view transitions to communicate meaning during navigation. Shared elements communicate continuity across routes. Suspense reveals animate loading handoffs. Directional slides encode navigation history. Crossfades signal content changes within the same location.

Each pattern answers a different question for the user:

| Pattern                | What it communicates            |
| ---------------------- | ------------------------------- |
| Shared element (morph) | "Same thing, going deeper"      |
| Suspense reveal        | "Data loaded"                   |
| Directional slide      | "Going forward / coming back"   |
| Same-route crossfade   | "Same place, different content" |

For API details and more patterns:

- [Link `transitionTypes` prop](/docs/app/api-reference/components/link#transitiontypes)
- [`useRouter`](/docs/app/api-reference/functions/use-router), which also supports `transitionTypes` in `push()` and `replace()`
- [React `ViewTransition` component](https://react.dev/reference/react/ViewTransition)
- [Complete CSS from this guide](https://github.com/vercel-labs/react-view-transitions-demo/blob/main/src/app/globals.css) — all keyframes and view transition rules in one file
