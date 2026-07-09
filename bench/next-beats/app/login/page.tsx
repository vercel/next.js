import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { Suspense } from 'react';
import { MusicNote } from '@/components/ui/music-note';
import { SignInForm } from '@/features/user/components/sign-in-form';

const SESSION_COOKIE = 'beats-user';

export default function LoginPage() {
  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <Suspense>
        <RedirectIfAuthed />
      </Suspense>
      <div className="w-full max-w-sm">
        <div className="mb-6 flex items-center justify-center gap-2 text-2xl font-bold">
          <MusicNote size={28} className="text-accent" />
          <span>NextBeats</span>
        </div>
        <SignInForm />
      </div>
    </div>
  );
}

async function RedirectIfAuthed() {
  const store = await cookies();
  if (store.has(SESSION_COOKIE)) redirect('/');
  return null;
}
