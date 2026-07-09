import type { Track as PrismaTrack, UserFavorite, UserTrackPlay } from '@/generated/prisma/client';

export type Track = {
  id: string;
  title: string;
  artist: string;
  album: string;
  duration: number;
  genre: string;
  coverColor: string;
  playCount: number;
  isFavorite: boolean;
  lastPlayedAt: Date | null;
  createdAt: Date;
};

type UserData = {
  favorites?: UserFavorite[];
  trackPlays?: UserTrackPlay[];
};

export function toTrack(row: PrismaTrack, userData?: UserData): Track {
  return {
    album: row.album,
    artist: row.artist,
    coverColor: row.coverColor,
    createdAt: row.createdAt,
    duration: row.duration,
    genre: row.genre,
    id: row.id,
    isFavorite: userData?.favorites ? userData.favorites.length > 0 : false,
    lastPlayedAt: userData?.trackPlays?.[0]?.lastPlayedAt ?? null,
    playCount: row.playCount,
    title: row.title,
  };
}
