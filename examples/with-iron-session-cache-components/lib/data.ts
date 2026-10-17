import "server-only";

import { cacheLife, cacheTag, updateTag } from "next/cache";
import { getCurrentUser } from "./auth";

// This file stands in for your database. The data lives in memory and resets
// when the server restarts. In a real app, replace these functions with calls
// to your database and verify passwords with a hashing library such as bcrypt.

type UserRecord = {
  id: string;
  name: string;
  email: string;
  // Demo only. Never store plaintext passwords in a real application.
  password: string;
};

export type Note = {
  id: string;
  text: string;
};

const users: UserRecord[] = [
  {
    id: "1",
    name: "Ada Lovelace",
    email: "ada@example.com",
    password: "password",
  },
];

const notesByUserId = new Map<string, Note[]>([
  ["1", [{ id: "n1", text: "Finish the analytical engine notes." }]],
]);

export async function verifyCredentials(
  email: string,
  password: string,
): Promise<string | null> {
  const user = users.find((u) => u.email === email);
  if (!user || user.password !== password) {
    return null;
  }
  return user.id;
}

export async function findUserById(id: string) {
  return users.find((u) => u.id === id) ?? null;
}

// Shared data. It does not depend on the request, so a plain `use cache`
// scope stores it on the server and includes it in the static shell.
export async function getAnnouncements() {
  "use cache";
  cacheTag("announcements");
  cacheLife("hours");

  return [
    "Cache Components is now enabled.",
    "Session data streams in after the shell.",
  ];
}

// Takes the id as an argument instead of reading the request, so this stays a
// plain `use cache` scope. The result is stored on the server, keyed by
// `userId`, and tagged for targeted invalidation.
async function getNotesByUserId(userId: string): Promise<Note[]> {
  "use cache";
  cacheTag(`notes:${userId}`);
  cacheLife("minutes");

  return notesByUserId.get(userId) ?? [];
}

async function getNoteById(
  userId: string,
  noteId: string,
): Promise<Note | null> {
  "use cache";
  cacheTag(`notes:${userId}`);
  cacheLife("minutes");

  const notes = notesByUserId.get(userId) ?? [];
  return notes.find((note) => note.id === noteId) ?? null;
}

// The exported readers resolve the user from the session, so there is no id for
// a caller to get wrong.
export async function getNotes(): Promise<Note[]> {
  const user = await getCurrentUser();
  return getNotesByUserId(user.id);
}

export async function getNote(noteId: string): Promise<Note | null> {
  const user = await getCurrentUser();
  return getNoteById(user.id, noteId);
}

// Writes go through a Server Action that has already checked the session, so
// this takes the verified id. See Step 5 of the guide.
export async function addUserNote(userId: string, text: string) {
  const existing = notesByUserId.get(userId) ?? [];
  const note: Note = { id: crypto.randomUUID(), text };
  notesByUserId.set(userId, [...existing, note]);

  // Invalidate this user's cached notes so the next read returns fresh data.
  updateTag(`notes:${userId}`);
}
