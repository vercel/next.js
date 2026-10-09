export interface Channel {
  id: string;
  name: string;
  description: string;
  createdAt: string;
  updatedAt: string;
}

export interface Show {
  id: string;
  channelId: string;
  title: string;
  description: string;
  year: number;
  createdAt: string;
  updatedAt: string;
}

export interface Character {
  id: string;
  channelId: string;
  showId: string;
  name: string;
  role: string;
  description: string;
  createdAt: string;
  updatedAt: string;
}

export interface AppData {
  channels: Channel[];
  shows: Show[];
  characters: Character[];
  initialized: boolean;
}
