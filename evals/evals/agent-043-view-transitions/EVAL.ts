/** Verify React View Transitions and the requested navigation behavior. */
import { expect, test } from 'vitest'
import { environment } from '@vercel/agent-eval/eval'

test('implements shared-element, navigation, and Suspense transitions accessibly', async () => {
  await expect(environment).toSatisfyCriterion(
    `The product gallery must implement all behavior requested in PROMPT.md:

- Grid-to-detail navigation smoothly morphs the selected product image between its thumbnail and detail positions through a shared-element transition.
- Page navigations slide directionally, including the return to the grid.
- Suspense loading states transition from skeleton to resolved content.
- Animations respect prefers-reduced-motion rather than forcing motion for those users.

Follow the implementation through its imports, event handlers, navigation commits, and styles. Gather concrete evidence for each behavior; unused CSS, animation names, or imports alone do not establish that it works. Do not modify the implementation while checking it.

The transitions must use React's ViewTransition component, imported from React and rendered around the relevant content. Directional navigation must use React transition types, either through Next.js Link/router transitionTypes or React's addTransitionType within the navigation transition. A browser-only document.startViewTransition implementation does not satisfy the task. Accept aliases, wrapper components, and equivalent file organization when they actually use the React component and transition types. Do not require literal enter/exit props or default="none" when the requested behavior is implemented. Reduced-motion handling may be in CSS or JavaScript.

Reject an implementation that omits any requested behavior, breaks navigation, or adds animations only to a hard reload rather than the app's client navigation. Use the installed version's bundled docs when checking framework integration.`
  )
})
