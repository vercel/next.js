import 'server-only';

import { SEED_PLAYLIST_TRACKS, SEED_PLAYLISTS, SEED_TRACKS, SEED_USERS } from '@/lib/seed-data';

export type User = {
  id: string;
  name: string;
  createdAt: Date;
};

export type Track = {
  id: string;
  title: string;
  artist: string;
  album: string;
  duration: number;
  genre: string;
  coverColor: string;
  playCount: number;
  createdAt: Date;
};

export type UserFavorite = {
  userId: string;
  trackId: string;
  addedAt: Date;
};

export type UserTrackPlay = {
  userId: string;
  trackId: string;
  lastPlayedAt: Date;
};

export type Playlist = {
  id: string;
  name: string;
  description: string;
  coverColor: string;
  userId: string | null;
  createdAt: Date;
};

export type PlaylistTrack = {
  playlistId: string;
  trackId: string;
  position: number;
  addedAt: Date;
};

type Store = {
  users: User[];
  tracks: Track[];
  favorites: UserFavorite[];
  plays: UserTrackPlay[];
  playlists: Playlist[];
  playlistTracks: PlaylistTrack[];
};

// Bench fixture: an in-memory, deterministically seeded store so the app builds
// and serves fully offline with zero external dependencies. Held on globalThis
// so the RSC, Server Action, and Route Handler bundles share one instance
// (they compile separately in production).
const globalForDb = globalThis as unknown as { __beatsStore?: Store };

function seedStore(): Store {
  return {
    users: SEED_USERS.map(u => ({ ...u })),
    tracks: SEED_TRACKS.map(t => ({ ...t })),
    favorites: [],
    plays: [],
    playlists: SEED_PLAYLISTS.map(p => ({ ...p })),
    playlistTracks: SEED_PLAYLIST_TRACKS.map(pt => ({ ...pt })),
  };
}

export const db = (globalForDb.__beatsStore ??= seedStore());
