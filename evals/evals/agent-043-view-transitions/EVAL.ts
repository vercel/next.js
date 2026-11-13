/** Verify React View Transitions and the requested navigation behavior. */
import { expect, test } from 'vitest'
import { environment } from '@vercel/agent-eval/eval'

test('implements shared-element, navigation, and Suspense transitions accessibly', async () => {
  await expect(environment).toSatisfyCriterion(
    `Verify the product gallery implements all of the following:
- React's ViewTransition component morphs the selected product image between the grid and detail page.
- Client navigation slides directionally using React transition types through Next.js Link/router transitionTypes or React.addTransitionType.
- Existing asynchronous Suspense content transitions from skeleton to resolved content. Do not require synchronous content to suspend.
- Animations respect prefers-reduced-motion.

Trace the component, navigation updates, and styles. Imports or unused CSS alone are insufficient. Browser-only document.startViewTransition does not qualify. Accept aliases, wrappers, and CSS or JavaScript reduced-motion handling; do not require literal enter/exit props or default="none". Inspect without modifying the app, and cite concrete evidence for every requirement.`
  )
})
