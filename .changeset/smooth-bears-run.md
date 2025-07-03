---
'next': patch
---

[dev-overlay] Show error overlay on any thrown value

We used to only show the error overlay on thrown values with a stack property.
On other thrown values we kept the overlay collapsed.
