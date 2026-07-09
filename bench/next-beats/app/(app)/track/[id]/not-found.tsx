import { Music } from 'lucide-react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';

export default function TrackNotFound() {
  return (
    <div className="flex flex-col items-center gap-3 px-5 py-16 text-center">
      <Music className="text-gray h-6 w-6" />
      <p className="text-sm font-medium text-black dark:text-white">Track not found</p>
      <p className="text-gray max-w-xs text-sm">This track doesn&apos;t exist or was removed.</p>
      <Link href="/library">
        <Button size="sm" variant="secondary">
          Browse library
        </Button>
      </Link>
    </div>
  );
}
