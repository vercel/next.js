import 'server-only';

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { db } from '@/lib/db';

const SESSION_COOKIE = 'beats-user';

export async function getCurrentUser() {
  'use cache: private';

  const store = await cookies();
  // Bench fixture: fall back to the seeded `e2e` user when no session cookie is
  // present, so per-user queries (favorites, recently played, playlists) still
  // run real work under benchmark load instead of short-circuiting.
  const userId = store.get(SESSION_COOKIE)?.value ?? 'e2e';
  const exists = db.users.find(u => u.id === userId);
  return exists?.id ?? '';
}

export async function getCurrentUserName() {
  'use cache: private';

  const userId = await getCurrentUser();
  const user = db.users.find(u => u.id === userId);
  return user?.name ?? 'listener';
}

export async function verifyAuth() {
  const userId = await getCurrentUser();
  if (!userId) {
    const store = await cookies();
    store.delete(SESSION_COOKIE);
    redirect('/login');
  }
  return userId;
}
