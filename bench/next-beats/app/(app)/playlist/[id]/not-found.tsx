import { ListMusic } from 'lucide-react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';

export default function PlaylistNotFound() {
  return (
    <div className="flex flex-col items-center gap-3 px-5 py-16 text-center">
      <ListMusic className="text-gray h-6 w-6" />
      <p className="text-sm font-medium text-black dark:text-white">Playlist not found</p>
      <p className="text-gray max-w-xs text-sm">This playlist doesn&apos;t exist or was deleted.</p>
      <Link href="/playlist">
        <Button size="sm" variant="secondary">
          All playlists
        </Button>
      </Link>
    </div>
  );
}
