'use server';

import { updateTag } from 'next/cache';
import { z } from 'zod';
import { SEED_PLAYLIST_IDS } from '@/features/playlist/playlist-constants';
import { verifyAuth } from '@/features/user/user-queries';
import { prisma } from '@/lib/db';
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
  await delay(300);
  const parsed = createPlaylistSchema.safeParse({ name: formData.get('name') });
  if (!parsed.success) {
    return { error: parsed.error.issues[0].message, ok: false as const };
  }

  const playlist = await prisma.playlist.create({
    data: {
      coverColor: colors[Math.floor(Math.random() * colors.length)],
      name: parsed.data.name,
      userId,
    },
  });
  updateTag(`playlists:${userId}`);
  return { ok: true as const, playlist };
}

export async function addToPlaylist(playlistId: string, trackId: string) {
  const userId = await verifyAuth();
  await delay(200);
  if (SEED_PLAYLIST_IDS.has(playlistId)) return { error: "Can't modify a demo playlist", ok: false as const };
  const existing = await prisma.playlistTrack.findUnique({
    where: { playlistId_trackId: { playlistId, trackId } },
  });
  if (existing) return { error: 'Already in this playlist', ok: false as const };

  const maxPos = await prisma.playlistTrack.aggregate({
    _max: { position: true },
    where: { playlistId },
  });

  await prisma.playlistTrack.create({
    data: {
      playlistId,
      position: (maxPos._max.position ?? -1) + 1,
      trackId,
    },
  });
  updateTag(`playlist-${playlistId}`);
  updateTag(`playlists:${userId}`);
  return { ok: true as const };
}

export async function removeFromPlaylist(playlistId: string, trackId: string) {
  const userId = await verifyAuth();
  await delay(200);
  if (SEED_PLAYLIST_IDS.has(playlistId)) return { error: "Can't modify a demo playlist", ok: false as const };
  await prisma.playlistTrack.delete({
    where: { playlistId_trackId: { playlistId, trackId } },
  });
  updateTag(`playlist-${playlistId}`);
  updateTag(`playlists:${userId}`);
  return { ok: true as const };
}

export async function deletePlaylist(playlistId: string) {
  const userId = await verifyAuth();
  const id = z.string().min(1).parse(playlistId);
  if (SEED_PLAYLIST_IDS.has(id)) return { error: "Can't delete a demo playlist", ok: false as const };
  await delay(300);
  await prisma.playlist.delete({ where: { id } });
  updateTag(`playlists:${userId}`);
  updateTag(`playlist-${id}`);
  return { ok: true as const };
}
