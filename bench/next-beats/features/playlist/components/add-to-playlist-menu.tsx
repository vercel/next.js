'use client';

import * as Ariakit from '@ariakit/react';
import { ListPlus } from 'lucide-react';
import { Suspense, use } from 'react';
import { Boundary } from '@/components/demo/boundary';
import { Skeleton } from '@/components/ui/skeleton';
import { AddToPlaylistButtons } from '@/features/playlist/components/playlist-interactions';
import type { PlaylistMenuItem } from '@/types/playlist';

export function AddToPlaylistMenu({
  trackId,
  itemsPromise,
  size = 'sm',
}: {
  trackId: string;
  itemsPromise: Promise<PlaylistMenuItem[]>;
  size?: 'sm' | 'lg';
}) {
  const menu = Ariakit.useMenuStore({ placement: 'bottom-start' });

  return (
    <>
      <Boundary label="AddToPlaylist">
        <Ariakit.MenuButton
          store={menu}
          aria-label="Add to playlist"
          onClick={(e: React.MouseEvent) => e.stopPropagation()}
          className={`text-gray data-[open]:text-accent dark:data-[open]:text-accent rounded-full transition-colors hover:text-black dark:hover:text-white ${size === 'lg' ? 'p-1.5' : 'p-1.5'}`}
        >
          <ListPlus className={size === 'lg' ? 'h-5 w-5' : 'h-4 w-4'} />
        </Ariakit.MenuButton>
      </Boundary>
      <Ariakit.Menu
        store={menu}
        className="border-divider dark:border-divider-dark z-50 w-56 rounded-xl border bg-white p-2 shadow-xl outline-none dark:bg-black"
        style={{ viewTransitionName: 'add-to-playlist-menu' }}
        gutter={8}
        unmountOnHide
      >
        <Boundary label="AddToPlaylist">
          <p className="text-muted mb-1 px-3 py-1 text-xs font-semibold">Add to Playlist</p>
          <Suspense
            fallback={
              <div className="flex flex-col gap-0.5">
                {Array.from({ length: 3 }).map((_, i) => (
                  <div key={i} className="flex items-center gap-2 rounded-md px-3 py-2">
                    <Skeleton className="h-4 w-4 shrink-0" />
                    <Skeleton className={`h-4 ${i === 0 ? 'w-24' : i === 1 ? 'w-20' : 'w-28'}`} />
                  </div>
                ))}
              </div>
            }
          >
            <PlaylistMenuItems trackId={trackId} itemsPromise={itemsPromise} />
          </Suspense>
        </Boundary>
      </Ariakit.Menu>
    </>
  );
}

function PlaylistMenuItems({ trackId, itemsPromise }: { trackId: string; itemsPromise: Promise<PlaylistMenuItem[]> }) {
  const items = use(itemsPromise);
  if (items.length === 0) {
    return <p className="text-muted px-3 py-2 text-xs">Create a playlist first.</p>;
  }
  return <AddToPlaylistButtons trackId={trackId} items={items} />;
}
