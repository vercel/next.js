import 'server-only';

import { cacheTag } from 'next/cache';
import { notFound } from 'next/navigation';
import { getCurrentUser } from '@/features/user/user-queries';
import { prisma } from '@/lib/db';
import { delay } from '@/lib/utils';
import { toTrack } from '@/types/track';

export async function getPlaylists() {
  const userId = await getCurrentUser();
  return getPlaylistsForUser(userId);
}

async function getPlaylistsForUser(userId: string) {
  'use cache';
  cacheTag(`playlists:${userId}`);

  await delay(1500);
  const rows = await prisma.playlist.findMany({
    include: { _count: { select: { tracks: true } } },
    orderBy: { createdAt: 'desc' },
    where: { OR: [{ userId }, { userId: null }] },
  });
  return rows.map(r => ({
    coverColor: r.coverColor,
    description: r.description,
    id: r.id,
    name: r.name,
    trackCount: r._count.tracks,
  }));
}

export async function getPlaylist(id: string) {
  const userId = await getCurrentUser();
  return getPlaylistForUser(id, userId);
}

async function getPlaylistForUser(id: string, userId: string) {
  'use cache';
  cacheTag(`playlist-${id}`);

  await delay(500);
  const row = await prisma.playlist.findFirst({
    include: {
      tracks: {
        include: { track: true },
        orderBy: { position: 'asc' },
      },
    },
    where: { id, OR: [{ userId }, { userId: null }] },
  });
  if (!row) notFound();
  return {
    coverColor: row.coverColor,
    description: row.description,
    id: row.id,
    name: row.name,
    trackCount: row.tracks.length,
    tracks: row.tracks.map(pt => toTrack(pt.track)),
  };
}

export async function getPlaylistMenuItems(trackId: string) {
  const userId = await getCurrentUser();
  return getPlaylistMenuItemsForUser(trackId, userId);
}

async function getPlaylistMenuItemsForUser(trackId: string, userId: string) {
  'use cache';
  cacheTag(`playlists:${userId}`);

  const playlists = await prisma.playlist.findMany({
    include: { _count: { select: { tracks: true } } },
    orderBy: { createdAt: 'desc' },
    where: { OR: [{ userId }, { userId: null }] },
  });
  if (playlists.length === 0) return [];

  const existing = await prisma.playlistTrack.findMany({
    select: { playlistId: true },
    where: { playlistId: { in: playlists.map(p => p.id) }, trackId },
  });
  const addedSet = new Set(existing.map(e => e.playlistId));
  return playlists.map(p => ({ label: p.name, value: p.id, active: addedSet.has(p.id) }));
}
