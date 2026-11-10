/** Refresh the current page after a Server Action mutation. */

import { expect, test } from 'vitest'
import { environment } from '@vercel/agent-eval/eval'

test('toggles the preference and refreshes from the Server Action', async () => {
  await expect(environment).toSatisfyCriterion(
    `The settings page displays the current notification preference and provides a form or control wired to a Server Action that toggles that same stored preference. The mutation must change the value read by the page so the refreshed UI shows the new state.

After the mutation succeeds, the Server Action must call refresh() imported from next/cache. The call must execute inside a real Server Action marked with the use server directive and happen after the mutation. Fail placeholder actions, no-op mutations, client-only state, or unrelated read and write values. Also fail redirect(), revalidatePath(), returning a flag for a Client Component, or client-side router.refresh() when used instead of the Server Action refresh(). The interaction must stay on the current page. Accept equivalent storage, component, and file organization.`
  )
})
