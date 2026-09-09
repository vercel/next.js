Add an unsaved-changes guard to the note editor at `/notes/[id]`.

If I have unsaved edits and I click any of the in-app navigation links (the
"All notes" and "Settings" links at the top of the editor), ask me to confirm
before leaving — and if I cancel, stay exactly where I am with my draft
intact. Use the browser's plain built-in confirm dialog for this (that's what
our old site used); don't build a custom modal.

Two hard constraints from our power users:

1. Middle-click, cmd+click, and ctrl+click to open a link in a new tab must
   keep working exactly the way browsers normally do: never intercepted, never
   a confirmation dialog, and the current tab keeps my draft untouched.
2. The guard must actually work for our in-app links — they're client-side
   navigations, not full page loads, and people keep losing drafts through
   them today.

Keep the existing data-testids, and keep the navigation as real links.
