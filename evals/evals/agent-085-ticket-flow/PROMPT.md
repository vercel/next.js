Three complaints just came in about the ticket flow on our field-service desk, and the fix has to satisfy all of them at once.

First: opening a brand-new ticket sometimes shows leftover text from the previous one. When a tech clicks the "New ticket" button on the list page, the form must start with an empty textarea — every time.

Second: techs constantly type half a ticket, jump over to the ticket list to double-check something, and then return to the form with the browser's Back/Forward buttons. Returning that way must resume the draft exactly as they left it — nobody wants to retype a long ticket because they peeked at the list. So whatever you do for the first complaint must not wipe the draft when someone comes back via Back or Forward.

Third — separately: the tickets list refetches from scratch every time a tech bounces back to it from a ticket or from the New Ticket form, even within seconds. Keep the list per-request fresh for new visits — it stays dynamic, no shared caching of its data — but let the router reuse what it just fetched for about two minutes when bouncing back, scoped to the tickets list page only.

In short: reaching the form through the "New ticket" button always starts blank; reaching the form you were already writing through browser Back/Forward always keeps what you typed; and bouncing back to the list within a couple of minutes reuses the list data it just fetched, while fresh visits stay per-request fresh. All three hold together.

Keep the form a client component, keep navigation client-side (real links — no full page reloads), and keep the existing data-testid attributes; our smoke tests select on them.
