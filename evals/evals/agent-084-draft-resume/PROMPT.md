Two complaints just came in about the New Ticket form on our field-service desk, and the fix has to satisfy both at once.

First: opening a brand-new ticket sometimes shows leftover text from the previous one. When a tech clicks the "New ticket" button on the list page, the form must start with an empty textarea — every time.

Second: techs constantly type half a ticket, jump over to the ticket list to double-check something, and then return to the form with the browser's Back/Forward buttons. Returning that way must resume the draft exactly as they left it — nobody wants to retype a long ticket because they peeked at the list. So whatever you do for the first complaint must not wipe the draft when someone comes back via Back or Forward.

In short: reaching the form through the "New ticket" button always starts blank; reaching the form you were already writing through browser Back/Forward always keeps what you typed. Both must hold at the same time.

Keep the form a client component, keep navigation client-side (real links — no full page reloads), and keep the existing data-testid attributes; our smoke tests select on them.
