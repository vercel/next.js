import { revalidateTag } from 'next/cache';
import { cookies } from 'next/headers';
import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';

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

  await prisma.track.update({
    where: { id: trackId },
    data: { playCount: { increment: 1 } },
  });

  await prisma.userTrackPlay.upsert({
    where: { userId_trackId: { userId, trackId } },
    create: { userId, trackId },
    update: { lastPlayedAt: new Date() },
  });

  revalidateTag(`recently-played:${userId}`, 'max');
  revalidateTag(`discover:${userId}`, 'max');

  return new NextResponse(null, { status: 204 });
}
