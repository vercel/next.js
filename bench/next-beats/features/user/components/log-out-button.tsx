'use client';

import { LogOut } from 'lucide-react';
import { useFormStatus } from 'react-dom';
import { Boundary } from '@/components/demo/boundary';
import { Spinner } from '@/components/ui/spinner';

export function LogOutButton() {
  const { pending } = useFormStatus();
  return (
    <Boundary label="LogOutButton">
      <button
        type="submit"
        disabled={pending}
        aria-label="Sign out"
        title="Sign out"
        className="text-gray rounded-full p-1.5 transition-colors hover:text-black disabled:opacity-60 dark:hover:text-white"
      >
        {pending ? <Spinner className="h-4 w-4" /> : <LogOut className="h-4 w-4" />}
      </button>
    </Boundary>
  );
}
