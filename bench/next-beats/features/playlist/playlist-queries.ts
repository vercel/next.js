import 'server-only';

import { cacheTag } from 'next/cache';
import { notFound } from 'next/navigation';
import { isSlowEnabled } from '@/components/demo/demo-slow';
import { getCurrentUser } from '@/features/user/user-queries';
import { db } from '@/lib/db';
import { delay } from '@/lib/utils';
import { toTrack } from '@/types/track';

const byCreatedAtDesc = (a: { createdAt: Date }, b: { createdAt: Date }) => b.createdAt.getTime() - a.createdAt.getTime();
const visibleTo = (userId: string) => (p: { userId: string | null }) => p.userId === userId || p.userId === null;

export async function getPlaylists() {
  const userId = await getCurrentUser();
  return getPlaylistsForUser(userId, await isSlowEnabled());
}

async function getPlaylistsForUser(userId: string, slow: boolean) {
  'use cache';
  cacheTag(`playlists:${userId}`);

  await delay(500, slow);
  return db.playlists
    .filter(visibleTo(userId))
    .sort(byCreatedAtDesc)
    .map(p => ({
      coverColor: p.coverColor,
      description: p.description,
      id: p.id,
      name: p.name,
      trackCount: db.playlistTracks.filter(pt => pt.playlistId === p.id).length,
    }));
}

export async function searchPlaylists(query: string) {
  const userId = await getCurrentUser();
  return searchPlaylistsForUser(userId, query, await isSlowEnabled());
}

async function searchPlaylistsForUser(userId: string, query: string, slow: boolean) {
  'use cache';
  cacheTag(`playlists:${userId}`);

  await delay(400, slow);
  const q = query.toLowerCase();
  return db.playlists
    .filter(visibleTo(userId))
    .filter(p => p.name.toLowerCase().includes(q))
    .sort(byCreatedAtDesc)
    .map(p => ({
      coverColor: p.coverColor,
      description: p.description,
      id: p.id,
      name: p.name,
      trackCount: db.playlistTracks.filter(pt => pt.playlistId === p.id).length,
    }));
}

export async function getPlaylist(id: string) {
  const userId = await getCurrentUser();
  return getPlaylistForUser(id, userId, await isSlowEnabled());
}

async function getPlaylistForUser(id: string, userId: string, slow: boolean) {
  'use cache';
  cacheTag(`playlist-${id}`);

  await delay(500, slow);
  const row = db.playlists.find(p => p.id === id && visibleTo(userId)(p));
  if (!row) notFound();
  const tracks = db.playlistTracks
    .filter(pt => pt.playlistId === id)
    .sort((a, b) => a.position - b.position)
    .flatMap(pt => {
      const track = db.tracks.find(t => t.id === pt.trackId);
      return track ? [toTrack(track)] : [];
    });
  return {
    coverColor: row.coverColor,
    description: row.description,
    id: row.id,
    name: row.name,
    trackCount: tracks.length,
    tracks,
  };
}

export async function getPlaylistMenuItems(trackId: string) {
  const userId = await getCurrentUser();
  return getPlaylistMenuItemsForUser(trackId, userId);
}

async function getPlaylistMenuItemsForUser(trackId: string, userId: string) {
  'use cache';
  cacheTag(`playlists:${userId}`);

  const playlists = db.playlists.filter(visibleTo(userId)).sort(byCreatedAtDesc);
  if (playlists.length === 0) return [];

  const playlistIds = new Set(playlists.map(p => p.id));
  const addedSet = new Set(
    db.playlistTracks.filter(pt => playlistIds.has(pt.playlistId) && pt.trackId === trackId).map(pt => pt.playlistId)
  );
  return playlists.map(p => ({ label: p.name, value: p.id, active: addedSet.has(p.id) }));
}
