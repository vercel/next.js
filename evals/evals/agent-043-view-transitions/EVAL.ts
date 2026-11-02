/** Verify the requested transition behavior without requiring one source shape. */
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

React ViewTransition and a correctly integrated browser View Transition API are both valid. For a browser-API solution, verify that the transition spans the actual asynchronous route update, rather than only wrapping a router.push() call that returns before the next page renders. Do not require ViewTransition imports or JSX tags, transitionTypes, enter/exit props, or default="none" literally when an equivalent implementation provides the requested behavior. Reduced-motion handling may be in CSS or JavaScript.

Reject an implementation that omits any requested behavior, breaks navigation, or adds animations only to a hard reload rather than the app's client navigation. Use the installed version's bundled docs when checking framework integration.`
  )
})
