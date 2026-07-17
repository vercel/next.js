'use server';

import { revalidateTag, updateTag } from 'next/cache';
import { z } from 'zod';
import { verifyAuth } from '@/features/user/user-queries';
import { db } from '@/lib/db';
import { delay } from '@/lib/utils';

const trackIdSchema = z.string().min(1);

export async function toggleFavorite(trackId: string) {
  const userId = await verifyAuth();
  await delay(200);
  const id = trackIdSchema.parse(trackId);

  const index = db.favorites.findIndex(f => f.userId === userId && f.trackId === id);
  if (index !== -1) {
    db.favorites.splice(index, 1);
  } else {
    db.favorites.push({ userId, trackId: id, addedAt: new Date() });
  }

  updateTag(`track-${id}:${userId}`);
  updateTag(`favorites:${userId}`);
  revalidateTag(`discover:${userId}`, 'max');
  return { ok: true as const };
}
