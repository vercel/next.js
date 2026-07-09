import 'server-only';

import { cacheLife, cacheTag } from 'next/cache';
import { notFound } from 'next/navigation';
import { getCurrentUser } from '@/features/user/user-queries';
import { prisma } from '@/lib/db';
import { delay } from '@/lib/utils';
import { toTrack } from '@/types/track';

const LIBRARY_PAGE_SIZE = 100;

export async function getLibrary(page: number = 1) {
  'use cache';
  cacheTag('library');
  cacheLife('hours');

  await delay(400);
  const rows = await prisma.track.findMany({
    orderBy: { createdAt: 'desc' },
    skip: (page - 1) * LIBRARY_PAGE_SIZE,
    take: LIBRARY_PAGE_SIZE + 1,
  });
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
  const rows = await prisma.userFavorite.findMany({
    where: { userId },
    orderBy: { addedAt: 'desc' },
    include: { track: true },
  });
  return rows.map(row => toTrack(row.track, { favorites: [row] }));
}

export async function getUserFavoriteIds() {
  const userId = await getCurrentUser();
  if (!userId) return new Set<string>();
  return getUserFavoriteIdsForUser(userId);
}

async function getUserFavoriteIdsForUser(userId: string) {
  'use cache';
  cacheTag(`favorites:${userId}`);

  const rows = await prisma.userFavorite.findMany({
    where: { userId },
    select: { trackId: true },
  });
  return new Set(rows.map(r => r.trackId));
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
  const rows = await prisma.userTrackPlay.findMany({
    where: { userId },
    orderBy: { lastPlayedAt: 'desc' },
    take: limit,
    include: { track: true },
  });
  return rows.map(row => toTrack(row.track, { trackPlays: [row] }));
}

export async function getTrack(id: string) {
  const userId = await getCurrentUser();
  return getTrackForUser(id, userId);
}

async function getTrackForUser(id: string, userId: string) {
  'use cache';
  cacheTag('tracks', `track-${id}`, `track-${id}:${userId}`);

  await delay(400);
  const row = await prisma.track.findUnique({
    where: { id },
    include: {
      favorites: { where: { userId } },
    },
  });
  if (!row) notFound();
  return toTrack(row, { favorites: row.favorites });
}

export async function getMostPlayed(limit: number = 8) {
  'use cache';
  cacheTag('tracks');

  await delay(700);
  const rows = await prisma.track.findMany({
    orderBy: { playCount: 'desc' },
    take: limit,
    where: { playCount: { gt: 0 } },
  });
  return rows.map(row => toTrack(row));
}

export async function getDiscover(limit: number = 8) {
  const userId = await getCurrentUser();
  return getDiscoverForUser(userId, limit);
}

async function getDiscoverForUser(userId: string, limit: number) {
  'use cache';
  cacheTag(`discover:${userId}`);

  await delay(1100);
  const rows = await prisma.track.findMany({
    orderBy: { playCount: 'desc' },
    take: limit,
    where: {
      favorites: { none: { userId } },
      trackPlays: { none: { userId } },
    },
  });
  return rows.map(row => toTrack(row));
}

export async function getTracksByGenre(genre: string) {
  'use cache';
  cacheTag('tracks', `genre-${genre}`);

  await delay(900);
  const rows = await prisma.track.findMany({
    orderBy: { playCount: 'desc' },
    where: { genre },
  });
  return rows.map(row => toTrack(row));
}

export async function searchTracks(query: string) {
  'use cache';
  cacheTag('search');
  cacheLife('hours');

  await delay(800);
  const rows = await prisma.track.findMany({
    orderBy: { playCount: 'desc' },
    take: 30,
    where: {
      // SQLite `contains` is already case-insensitive for ASCII, so the
      // Postgres-only `mode: 'insensitive'` filter is dropped here.
      OR: [
        { title: { contains: query } },
        { artist: { contains: query } },
        { album: { contains: query } },
      ],
    },
  });
  return rows.map(row => toTrack(row));
}
