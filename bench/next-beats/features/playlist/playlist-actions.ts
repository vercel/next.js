'use server';

import { updateTag } from 'next/cache';
import { z } from 'zod';
import { SEED_PLAYLIST_IDS } from '@/features/playlist/playlist-constants';
import { isSlowEnabled } from '@/components/demo/demo-slow';
import { verifyAuth } from '@/features/user/user-queries';
import { db } from '@/lib/db';
import { delay } from '@/lib/utils';

const createPlaylistSchema = z.object({
  name: z.string().min(1, 'Name is required').max(100),
});

const colors = [
  'from-violet-500 to-purple-600',
  'from-purple-400 to-violet-500',
  'from-fuchsia-500 to-purple-600',
  'from-purple-500 to-violet-700',
  'from-violet-400 to-purple-500',
  'from-fuchsia-400 to-violet-500',
];

export async function createPlaylist(formData: FormData) {
  const userId = await verifyAuth();
  await delay(300, await isSlowEnabled());
  const parsed = createPlaylistSchema.safeParse({ name: formData.get('name') });
  if (!parsed.success) {
    return { error: parsed.error.issues[0].message, ok: false as const };
  }

  const playlist = {
    id: crypto.randomUUID(),
    coverColor: colors[Math.floor(Math.random() * colors.length)],
    createdAt: new Date(),
    description: '',
    name: parsed.data.name,
    userId,
  };
  db.playlists.push(playlist);
  updateTag(`playlists:${userId}`);
  return { ok: true as const, playlist };
}

export async function addToPlaylist(playlistId: string, trackId: string) {
  const userId = await verifyAuth();
  await delay(200, await isSlowEnabled());
  if (SEED_PLAYLIST_IDS.has(playlistId)) return { error: "Can't modify a demo playlist", ok: false as const };
  const existing = db.playlistTracks.find(pt => pt.playlistId === playlistId && pt.trackId === trackId);
  if (existing) return { error: 'Already in this playlist', ok: false as const };

  const maxPos = db.playlistTracks
    .filter(pt => pt.playlistId === playlistId)
    .reduce((max, pt) => Math.max(max, pt.position), -1);

  db.playlistTracks.push({ playlistId, trackId, position: maxPos + 1, addedAt: new Date() });
  updateTag(`playlist-${playlistId}`);
  updateTag(`playlists:${userId}`);
  return { ok: true as const };
}

export async function removeFromPlaylist(playlistId: string, trackId: string) {
  const userId = await verifyAuth();
  await delay(200, await isSlowEnabled());
  if (SEED_PLAYLIST_IDS.has(playlistId)) return { error: "Can't modify a demo playlist", ok: false as const };
  const index = db.playlistTracks.findIndex(pt => pt.playlistId === playlistId && pt.trackId === trackId);
  if (index !== -1) db.playlistTracks.splice(index, 1);
  updateTag(`playlist-${playlistId}`);
  updateTag(`playlists:${userId}`);
  return { ok: true as const };
}

export async function deletePlaylist(playlistId: string) {
  const userId = await verifyAuth();
  const id = z.string().min(1).parse(playlistId);
  if (SEED_PLAYLIST_IDS.has(id)) return { error: "Can't delete a demo playlist", ok: false as const };
  await delay(300, await isSlowEnabled());
  const index = db.playlists.findIndex(p => p.id === id);
  if (index !== -1) db.playlists.splice(index, 1);
  for (let i = db.playlistTracks.length - 1; i >= 0; i--) {
    if (db.playlistTracks[i].playlistId === id) db.playlistTracks.splice(i, 1);
  }
  updateTag(`playlists:${userId}`);
  updateTag(`playlist-${id}`);
  return { ok: true as const };
}
