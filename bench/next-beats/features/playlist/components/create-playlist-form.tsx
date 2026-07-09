'use client';

import { toast } from 'sonner';
import { Boundary } from '@/components/demo/boundary';
import { Button } from '@/components/ui/button';
import { createPlaylist } from '@/features/playlist/playlist-actions';

export function CreatePlaylistForm() {
  async function createPlaylistAction(formData: FormData) {
    const result = await createPlaylist(formData);
    if (result.ok) {
      toast.success('Playlist created');
    } else {
      toast.error(result.error);
    }
  }

  return (
    <Boundary label="CreatePlaylistForm">
      <form action={createPlaylistAction} className="flex gap-2">
        <input
          name="name"
          placeholder="New playlist name…"
          required
          autoComplete="off"
          data-1p-ignore
          data-lpignore="true"
          data-form-type="other"
          className="flex-1"
          onKeyDown={e => {
            if (e.key === 'Enter' && e.metaKey) {
              e.currentTarget.form?.requestSubmit();
            }
          }}
        />
        <Button type="submit" size="sm">
          Create
        </Button>
      </form>
    </Boundary>
  );
}
