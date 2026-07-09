import { Music } from 'lucide-react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';

export default function NotFound() {
  return (
    <div className="flex flex-col items-center gap-3 px-5 py-16 text-center">
      <Music className="text-gray h-8 w-8" />
      <p className="text-sm font-medium text-black dark:text-white">Page not found</p>
      <p className="text-gray max-w-xs text-sm">The page you&apos;re looking for doesn&apos;t exist.</p>
      <Link href="/">
        <Button variant="secondary">Go home</Button>
      </Link>
    </div>
  );
}
