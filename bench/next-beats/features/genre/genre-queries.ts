import 'server-only';

import { cacheLife, cacheTag } from 'next/cache';
import { prisma } from '@/lib/db';
import { delay } from '@/lib/utils';

export async function getGenres() {
  'use cache';
  cacheTag('genres');
  cacheLife('days');

  await delay(600);
  const rows = await prisma.track.groupBy({
    by: ['genre'],
    _count: { genre: true },
    orderBy: { _count: { genre: 'desc' } },
  });
  return rows.map(r => ({
    count: r._count.genre,
    genre: r.genre,
  }));
}
