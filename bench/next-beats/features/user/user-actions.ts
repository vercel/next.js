'use server';

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { prisma } from '@/lib/db';

const SESSION_COOKIE = 'beats-user';

const signInSchema = z.object({
  name: z.string().trim().min(1, 'Name is required').max(50, 'Name must be 50 characters or fewer'),
});

export async function signIn(formData: FormData) {
  const parsed = signInSchema.safeParse({ name: formData.get('name') });
  if (!parsed.success) {
    return { error: parsed.error.issues[0].message, ok: false as const };
  }

  let userId: string;
  try {
    const user = await prisma.user.upsert({
      where: { name: parsed.data.name },
      create: { name: parsed.data.name },
      update: {},
    });
    userId = user.id;
  } catch {
    return { error: 'Could not sign you in. Please try again.', ok: false as const };
  }

  const store = await cookies();
  store.set(SESSION_COOKIE, userId, {
    path: '/',
    sameSite: 'lax',
    maxAge: 60 * 60 * 24 * 30, // 30 days
  });
  redirect('/');
}

export async function signOut() {
  const store = await cookies();
  store.delete(SESSION_COOKIE);
  redirect('/login');
}
