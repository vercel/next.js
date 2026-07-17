import { revalidateTag } from 'next/cache';
import { cookies } from 'next/headers';
import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db';

const SESSION_COOKIE = 'beats-user';

const bodySchema = z.object({
  trackId: z.string().min(1),
});

export async function POST(request: NextRequest) {
  const store = await cookies();
  // Bench fixture: fall back to the seeded `e2e` user when no session cookie is
  // present, matching getCurrentUser(), so playback works without signing in.
  const userId = store.get(SESSION_COOKIE)?.value ?? 'e2e';

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return new NextResponse(null, { status: 400 });
  const { trackId } = parsed.data;

  const track = db.tracks.find(t => t.id === trackId);
  if (track) track.playCount += 1;

  const play = db.plays.find(p => p.userId === userId && p.trackId === trackId);
  if (play) {
    play.lastPlayedAt = new Date();
  } else {
    db.plays.push({ userId, trackId, lastPlayedAt: new Date() });
  }

  revalidateTag(`recently-played:${userId}`, 'max');
  revalidateTag(`discover:${userId}`, 'max');

  return new NextResponse(null, { status: 204 });
}
