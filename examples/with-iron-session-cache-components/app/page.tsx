import { Suspense } from "react";
import Link from "next/link";
import { getCurrentUser } from "@/lib/auth";
import { getAnnouncements, getUserNotes } from "@/lib/data";
import { addNote, logout } from "./actions";
import { UserProvider } from "./user-provider";
import { UserBadge } from "./user-badge";

export default function Page() {
  return (
    <main>
      {/* Shared content. Prerendered into the static shell. */}
      <Announcements />

      {/* Reads the session, so it renders into the per-session App Shell
          instead of the shared static shell. */}
      <Suspense fallback={<p>Loading your dashboard…</p>}>
        <Dashboard />
      </Suspense>
    </main>
  );
}

async function Announcements() {
  const announcements = await getAnnouncements();

  return (
    <section>
      <h2>Announcements</h2>
      <ul>
        {announcements.map((announcement) => (
          <li key={announcement}>{announcement}</li>
        ))}
      </ul>
    </section>
  );
}

async function Dashboard() {
  // Create the promise once; await it here for server rendering and hand the
  // same promise to a Client Component that unwraps it with `use()`.
  const userPromise = getCurrentUser();
  const user = await userPromise;
  const notes = await getUserNotes(user.id);

  return (
    <UserProvider userPromise={userPromise}>
      <section>
        <h1>Welcome, {user.name}</h1>
        <Suspense fallback={<span>Loading…</span>}>
          <UserBadge />
        </Suspense>
        <form action={logout}>
          <button type="submit">Log out</button>
        </form>

        <h2>Your notes</h2>
        <ul>
          {notes.map((note) => (
            <li key={note.id}>
              <Link href={`/notes/${note.id}`}>{note.text}</Link>
            </li>
          ))}
        </ul>

        <form action={addNote}>
          <input name="note" placeholder="Add a note" />
          <button type="submit">Add</button>
        </form>
      </section>
    </UserProvider>
  );
}
