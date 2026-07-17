import 'server-only';

import { cacheLife, cacheTag } from 'next/cache';
import { notFound } from 'next/navigation';
import { getCurrentUser } from '@/features/user/user-queries';
import { db } from '@/lib/db';
import { delay } from '@/lib/utils';
import { toTrack } from '@/types/track';

const LIBRARY_PAGE_SIZE = 100;

const byCreatedAtDesc = (a: { createdAt: Date }, b: { createdAt: Date }) => b.createdAt.getTime() - a.createdAt.getTime();
const byPlayCountDesc = (a: { playCount: number }, b: { playCount: number }) => b.playCount - a.playCount;

export async function getLibrary(page: number = 1) {
  'use cache';
  cacheTag('library');
  cacheLife('hours');

  await delay(400);
  const sorted = [...db.tracks].sort(byCreatedAtDesc);
  const start = (page - 1) * LIBRARY_PAGE_SIZE;
  const rows = sorted.slice(start, start + LIBRARY_PAGE_SIZE + 1);
  const hasMore = rows.length > LIBRARY_PAGE_SIZE;
  const items = hasMore ? rows.slice(0, LIBRARY_PAGE_SIZE) : rows;
  return {
    hasMore,
    tracks: items.map(row => toTrack(row)),
  };
}

export async function getFavorites() {
  const userId = await getCurrentUser();
  return getFavoritesForUser(userId);
}

async function getFavoritesForUser(userId: string) {
  'use cache';
  cacheTag(`favorites:${userId}`);

  await delay(500);
  const rows = db.favorites.filter(f => f.userId === userId).sort((a, b) => b.addedAt.getTime() - a.addedAt.getTime());
  return rows.flatMap(row => {
    const track = db.tracks.find(t => t.id === row.trackId);
    return track ? [toTrack(track, { favorites: [row] })] : [];
  });
}

export async function getUserFavoriteIds() {
  const userId = await getCurrentUser();
  if (!userId) return new Set<string>();
  return getUserFavoriteIdsForUser(userId);
}

async function getUserFavoriteIdsForUser(userId: string) {
  'use cache';
  cacheTag(`favorites:${userId}`);

  return new Set(db.favorites.filter(f => f.userId === userId).map(f => f.trackId));
}

export async function getRecentlyPlayed(limit: number = 8) {
  const userId = await getCurrentUser();
  return getRecentlyPlayedForUser(userId, limit);
}

async function getRecentlyPlayedForUser(userId: string, limit: number) {
  'use cache';
  cacheTag(`recently-played:${userId}`);
  cacheLife('minutes');

  await delay(500);
  const rows = db.plays
    .filter(p => p.userId === userId)
    .sort((a, b) => b.lastPlayedAt.getTime() - a.lastPlayedAt.getTime())
    .slice(0, limit);
  return rows.flatMap(row => {
    const track = db.tracks.find(t => t.id === row.trackId);
    return track ? [toTrack(track, { trackPlays: [row] })] : [];
  });
}

export async function getTrack(id: string) {
  const userId = await getCurrentUser();
  return getTrackForUser(id, userId);
}

async function getTrackForUser(id: string, userId: string) {
  'use cache';
  cacheTag('tracks', `track-${id}`, `track-${id}:${userId}`);

  await delay(400);
  const row = db.tracks.find(t => t.id === id);
  if (!row) notFound();
  const favorites = db.favorites.filter(f => f.trackId === id && f.userId === userId);
  return toTrack(row, { favorites });
}

export async function getMostPlayed(limit: number = 8) {
  'use cache';
  cacheTag('tracks');

  await delay(700);
  return [...db.tracks]
    .filter(t => t.playCount > 0)
    .sort(byPlayCountDesc)
    .slice(0, limit)
    .map(row => toTrack(row));
}

export async function getDiscover(limit: number = 8) {
  const userId = await getCurrentUser();
  return getDiscoverForUser(userId, limit);
}

async function getDiscoverForUser(userId: string, limit: number) {
  'use cache';
  cacheTag(`discover:${userId}`);

  await delay(1100);
  const favorited = new Set(db.favorites.filter(f => f.userId === userId).map(f => f.trackId));
  const played = new Set(db.plays.filter(p => p.userId === userId).map(p => p.trackId));
  return [...db.tracks]
    .filter(t => !favorited.has(t.id) && !played.has(t.id))
    .sort(byPlayCountDesc)
    .slice(0, limit)
    .map(row => toTrack(row));
}

export async function getTracksByGenre(genre: string) {
  'use cache';
  cacheTag('tracks', `genre-${genre}`);

  await delay(900);
  return [...db.tracks]
    .filter(t => t.genre === genre)
    .sort(byPlayCountDesc)
    .map(row => toTrack(row));
}

export async function searchTracks(query: string) {
  'use cache';
  cacheTag('search');
  cacheLife('hours');

  await delay(800);
  const q = query.toLowerCase();
  return [...db.tracks]
    .filter(
      t => t.title.toLowerCase().includes(q) || t.artist.toLowerCase().includes(q) || t.album.toLowerCase().includes(q)
    )
    .sort(byPlayCountDesc)
    .slice(0, 30)
    .map(row => toTrack(row));
}
