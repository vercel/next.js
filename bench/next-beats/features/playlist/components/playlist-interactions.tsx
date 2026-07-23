'use client';

import * as Ariakit from '@ariakit/react';
import { Check, Plus, Trash2, X } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { startTransition, useOptimistic } from 'react';
import { toast } from 'sonner';
import { Boundary } from '@/components/demo/boundary';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { deletePlaylist, removeFromPlaylist, addToPlaylist } from '@/features/playlist/playlist-actions';
import { cn } from '@/lib/utils';

export function DeletePlaylistButton({ playlistId, size = 'sm' }: { playlistId: string; size?: 'sm' | 'lg' }) {
  const dialog = Ariakit.useDialogStore();
  const router = useRouter();

  async function handleConfirm(): Promise<boolean> {
    const result = await deletePlaylist(playlistId);
    if (result?.error) {
      toast.error(result.error);
      return false;
    }
    toast.success('Playlist deleted');
    router.push('/playlist');
    return true;
  }

  return (
    <>
      <Boundary label="DeletePlaylistButton">
        <button
          type="button"
          onClick={e => {
            e.stopPropagation();
            dialog.show();
          }}
          aria-label="Delete playlist"
          className={`text-gray hover:text-danger rounded-full transition-colors ${size === 'lg' ? 'p-1.5' : 'p-1.5'}`}
        >
          <Trash2 className={size === 'lg' ? 'h-5 w-5' : 'h-4 w-4'} />
        </button>
      </Boundary>
      <ConfirmDialog
        store={dialog}
        title="Delete playlist?"
        description="This playlist and all its track associations will be removed. This can't be undone."
        confirmLabel="Delete"
        confirmAction={handleConfirm}
      />
    </>
  );
}

export function RemoveFromPlaylistButton({ playlistId, trackId }: { playlistId: string; trackId: string }) {
  const [isPending, setIsPending] = useOptimistic(false);

  function handleRemove(e: React.MouseEvent) {
    e.stopPropagation();
    startTransition(async () => {
      setIsPending(true);
      const result = await removeFromPlaylist(playlistId, trackId);
      if (result?.error) toast.error(result.error);
    });
  }

  return (
    <Boundary label="RemoveButton">
      <button
        type="button"
        onClick={handleRemove}
        disabled={isPending}
        data-pending={isPending || undefined}
        aria-label="Remove from playlist"
        className="text-gray hover:text-danger rounded-full p-1.5 transition-colors"
      >
        <X className="h-4 w-4" />
      </button>
    </Boundary>
  );
}

export function AddToPlaylistButtons({
  trackId,
  items,
}: {
  trackId: string;
  items: { label: string; value: string; active: boolean }[];
}) {
  async function togglePlaylistAction(playlistId: string, currentlyActive: boolean, label: string) {
    if (currentlyActive) {
      const result = await removeFromPlaylist(playlistId, trackId);
      if (result?.error) {
        toast.error(result.error);
      } else {
        toast.success(`Removed from ${label}`);
      }
    } else {
      const result = await addToPlaylist(playlistId, trackId);
      if (result?.error) {
        toast.error(result.error);
      } else {
        toast.success(`Added to ${label}`);
      }
    }
  }

  return (
    <div className="flex flex-col gap-0.5" style={{ viewTransitionName: 'none' }}>
      {items.map(item => (
        <PlaylistToggleItem key={item.value} item={item} toggleAction={togglePlaylistAction} />
      ))}
    </div>
  );
}

function PlaylistToggleItem({
  item,
  toggleAction,
}: {
  item: { label: string; value: string; active: boolean };
  toggleAction: (value: string, active: boolean, label: string) => void | Promise<void>;
}) {
  const [optimisticActive, setOptimisticActive] = useOptimistic(item.active);

  function handleClick() {
    startTransition(async () => {
      setOptimisticActive(!optimisticActive);
      await toggleAction(item.value, optimisticActive, item.label);
    });
  }

  return (
    <Ariakit.MenuItem
      onClick={(e: React.MouseEvent) => {
        e.stopPropagation();
        e.preventDefault();
        handleClick();
      }}
      hideOnClick={false}
      className={cn(
        'hover:bg-card dark:hover:bg-card-dark data-active-item:bg-card dark:data-active-item:bg-card-dark flex w-full cursor-pointer items-center gap-2 rounded-md px-3 py-2 text-left text-sm transition-colors outline-none',
        optimisticActive ? 'text-accent' : 'text-black dark:text-white',
      )}
    >
      {optimisticActive ? <Check className="h-4 w-4 shrink-0" /> : <Plus className="h-4 w-4 shrink-0" />}
      <span className="truncate">{item.label}</span>
    </Ariakit.MenuItem>
  );
}
