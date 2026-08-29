import { expect, test } from 'vitest'
import { environment } from '@vercel/agent-eval/eval'

test('keeps search results useful during updates', async () => {
  await expect(environment).toSatisfyCriterion(`
    Strictly judge the final searchable directory. Search and the delayed
    searchMembers data read must still work; deleting the delay or functionality
    fails. Once a result list has been revealed, typing a new query must not clear,
    unmount, or replace that useful list with a spinner, skeleton, or premature
    empty state while the next result is pending. Out-of-order responses must not
    overwrite a newer query. Pending feedback may use any implementation and may
    dim or otherwise mark the retained results, but it should be local to the
    interaction. If a spinner is used for these fast updates, it should be delayed
    enough not to flash. Do not require useTransition, useDeferredValue, a client
    query library, or any particular API when another implementation prevents the
    same user-visible failures.
  `)
})
