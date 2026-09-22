The `/` route works, but the latest Turbopack bundle analysis shows that `lib/chat-db/schema.ts` is included in the initial client JavaScript through `app/Uploader.tsx`.

Reduce the client JavaScript without changing the attachment validation or the rendered UI. Add a boundary guard so a future Client Component cannot import the database schema again. Verify the production build and explain which change removes the database schema from the client graph and which change prevents it from being imported there again.
