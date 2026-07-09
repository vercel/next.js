import type { Track } from '@/types/track';

export type PlaylistSummary = {
  id: string;
  name: string;
  description: string;
  coverColor: string;
  trackCount: number;
};

export type PlaylistWithTracks = PlaylistSummary & {
  tracks: Track[];
};

export type PlaylistMenuItem = {
  label: string;
  value: string;
  active: boolean;
};
