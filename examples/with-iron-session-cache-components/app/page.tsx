import { Suspense } from "react";
import Link from "next/link";
import { getCurrentUser } from "@/lib/auth";
import { getAnnouncements, getNotes } from "@/lib/data";
import { addNote, logout } from "./actions";
import { UserProvider } from "./user-provider";
import { UserBadge } from "./user-badge";

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

async function Notes() {
  // `getNotes()` resolves the user from the session, so there is no id to pass.
  const notes = await getNotes();

  return (
    <section>
      <h2>Your notes</h2>
      <ul>
        {notes.map((note) => (
          <li key={note.id}>
            <Link href={`/notes/${note.id}`} prefetch={true}>
              {note.text}
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

function Dashboard() {
  // Create the promise once and hand it to the provider without awaiting it, so
  // the dashboard chrome renders immediately and each consumer resolves the
  // session behind its own boundary.
  const userPromise = getCurrentUser();

  return (
    <UserProvider userPromise={userPromise}>
      <section>
        <Suspense fallback={<span>Loading…</span>}>
          <UserBadge />
        </Suspense>
        <form action={logout}>
          <button type="submit">Log out</button>
        </form>
      </section>

      <Suspense fallback={<p>Loading your notes…</p>}>
        <Notes />
      </Suspense>

      <form action={addNote}>
        <input name="note" placeholder="Add a note" />
        <button type="submit">Add</button>
      </form>
    </UserProvider>
  );
}

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
