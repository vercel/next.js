import 'server-only';

import { cacheLife, cacheTag } from 'next/cache';
import { db } from '@/lib/db';
import { delay } from '@/lib/utils';

export async function getGenres() {
  'use cache';
  cacheTag('genres');
  cacheLife('days');

  await delay(600);
  const counts = new Map<string, number>();
  for (const track of db.tracks) {
    counts.set(track.genre, (counts.get(track.genre) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([genre, count]) => ({ count, genre }))
    .sort((a, b) => b.count - a.count);
}
