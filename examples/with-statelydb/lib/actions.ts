"use server";

import { keyPath } from "@stately-cloud/client";
import { statelyClient } from "./stately";
import { Channel as StatelyChannel, Show as StatelyShow, Character as StatelyCharacter } from "./schema/stately_pb";
import type { Channel, Show, Character } from "./types";
import { idToString, stringToId } from "./utils/idHelpers";
import { toChannel, toShow, toCharacter } from "./utils/serialization";
import { revalidatePath } from "next/cache";

// ============================================================================
// CHANNEL ACTIONS
// ============================================================================

export async function fetchChannels(): Promise<Channel[]> {
  const channels: Channel[] = [];

  // List all channels by scanning from the root
  const iter = statelyClient.beginScan({ itemTypes: ["Channel"] });

  for await (const item of iter) {
    if (statelyClient.isType(item, "Channel")) {
      channels.push(toChannel(item));
    }
  }

  // Sort by name
  return channels.sort((a, b) => a.name.localeCompare(b.name));
}

export async function fetchChannel(channelIdStr: string): Promise<Channel | null> {
  const channelId = stringToId(channelIdStr);
  const channel = await statelyClient.get("Channel", keyPath`/channel-${channelId}`);

  if (!channel || !statelyClient.isType(channel, "Channel")) {
    return null;
  }

  return toChannel(channel);
}

export async function createChannel(formData: FormData) {
  const name = formData.get("name") as string;
  const description = formData.get("description") as string;

  const channel = statelyClient.create("Channel", {
    name,
    description,
  });

  await statelyClient.put(channel);
  revalidatePath("/");

  return idToString(channel.channelId);
}

export async function updateChannel(channelIdStr: string, formData: FormData) {
  const name = formData.get("name") as string;
  const description = formData.get("description") as string;
  const channelId = stringToId(channelIdStr);

  const channel = statelyClient.create("Channel", {
    channelId,
    name,
    description,
  });

  await statelyClient.put(channel);
  revalidatePath(`/channels/${channelIdStr}`);
  revalidatePath("/");
}

export async function deleteChannel(channelIdStr: string) {
  const channelId = stringToId(channelIdStr);

  // Cascade delete: delete all shows and characters for this channel
  const shows = await fetchShowsByChannel(channelIdStr);

  for (const show of shows) {
    // Delete all characters for this show
    await deleteShow(channelIdStr, show.id, false);
  }

  // Delete the channel
  await statelyClient.del(keyPath`/channel-${channelId}`);
  revalidatePath("/");
}

// ============================================================================
// SHOW ACTIONS
// ============================================================================

export async function fetchShows(): Promise<Show[]> {
  const shows: Show[] = [];

  // List all shows by scanning from the root
  const iter = statelyClient.beginScan({ itemTypes: ["Show"] });

  for await (const item of iter) {
    if (statelyClient.isType(item, "Show")) {
      shows.push(toShow(item));
    }
  }

  return shows;
}

export async function fetchShowsByChannel(channelIdStr: string): Promise<Show[]> {
  const channelId = stringToId(channelIdStr);
  const shows: Show[] = [];

  // List shows for this channel using the hierarchical key path
  const iter = statelyClient.beginList(keyPath`/channel-${channelId}/show-`);

  for await (const item of iter) {
    if (statelyClient.isType(item, "Show")) {
      shows.push(toShow(item));
    }
  }

  return shows;
}

export async function fetchShow(channelIdStr: string, showIdStr: string): Promise<Show | null> {
  const channelId = stringToId(channelIdStr);
  const showId = stringToId(showIdStr);

  const show = await statelyClient.get("Show", keyPath`/channel-${channelId}/show-${showId}`);

  if (!show || !statelyClient.isType(show, "Show")) {
    return null;
  }

  return toShow(show);
}

export async function createShow(channelIdStr: string, formData: FormData) {
  const title = formData.get("title") as string;
  const description = formData.get("description") as string;
  const year = formData.get("year") as string;
  const channelId = stringToId(channelIdStr);

  const show = statelyClient.create("Show", {
    channelId,
    title,
    description,
    year,
  });

  await statelyClient.put(show);
  revalidatePath(`/channels/${channelIdStr}`);
  revalidatePath("/");

  return idToString(show.showId);
}

export async function updateShow(channelIdStr: string, showIdStr: string, formData: FormData) {
  const title = formData.get("title") as string;
  const description = formData.get("description") as string;
  const year = formData.get("year") as string;
  const channelId = stringToId(channelIdStr);
  const showId = stringToId(showIdStr);

  const show = statelyClient.create("Show", {
    channelId,
    showId,
    title,
    description,
    year,
  });

  await statelyClient.put(show);
  revalidatePath(`/channels/${channelIdStr}/shows/${showIdStr}`);
  revalidatePath(`/channels/${channelIdStr}`);
  revalidatePath("/");
}

export async function deleteShow(channelIdStr: string, showIdStr: string, revalidate = true) {
  const channelId = stringToId(channelIdStr);
  const showId = stringToId(showIdStr);

  // Cascade delete: delete all characters for this show
  const characters = await fetchCharactersByShow(channelIdStr, showIdStr);

  for (const character of characters) {
    await statelyClient.del(keyPath`/channel-${channelId}/show-${showId}/character-${stringToId(character.id)}`);
  }

  await statelyClient.del(keyPath`/show-${showId}`);

  if (revalidate) {
    revalidatePath(`/channels/${channelIdStr}`);
    revalidatePath("/");
  }
}

// ============================================================================
// CHARACTER ACTIONS
// ============================================================================

export async function fetchCharacters(): Promise<Character[]> {
  const characters: Character[] = [];

  // List all characters by scanning from the root
  const iter = statelyClient.beginScan({ itemTypes: ["Character"] });

  for await (const item of iter) {
    if (statelyClient.isType(item, "Character")) {
      characters.push(toCharacter(item));
    }
  }

  return characters;
}

export async function fetchCharactersByShow(channelIdStr: string, showIdStr: string): Promise<Character[]> {
  const channelId = stringToId(channelIdStr);
  const showId = stringToId(showIdStr);
  const characters: Character[] = [];

  // List characters for this show using the hierarchical key path
  const iter = statelyClient.beginList(keyPath`/channel-${channelId}/show-${showId}/character-`);

  for await (const item of iter) {
    if (statelyClient.isType(item, "Character")) {
      characters.push(toCharacter(item));
    }
  }

  return characters;
}

export async function fetchCharacter(channelIdStr: string, showIdStr: string, characterIdStr: string): Promise<Character | null> {
  const channelId = stringToId(channelIdStr);
  const showId = stringToId(showIdStr);
  const characterId = stringToId(characterIdStr);

  const character = await statelyClient.get("Character",
    keyPath`/channel-${channelId}/show-${showId}/character-${characterId}`
  );

  if (!character || !statelyClient.isType(character, "Character")) {
    return null;
  }

  return toCharacter(character);
}

export async function createCharacter(channelIdStr: string, showIdStr: string, formData: FormData) {
  const name = formData.get("name") as string;
  const role = formData.get("role") as string;
  const description = formData.get("description") as string;
  const channelId = stringToId(channelIdStr);
  const showId = stringToId(showIdStr);

  const character = statelyClient.create("Character", {
    channelId,
    showId,
    name,
    role,
    description,
  });

  await statelyClient.put(character);
  revalidatePath(`/channels/${channelIdStr}/shows/${showIdStr}`);

  return idToString(character.characterId);
}

export async function updateCharacter(
  channelIdStr: string,
  showIdStr: string,
  characterIdStr: string,
  formData: FormData
) {
  const name = formData.get("name") as string;
  const role = formData.get("role") as string;
  const description = formData.get("description") as string;
  const channelId = stringToId(channelIdStr);
  const showId = stringToId(showIdStr);
  const characterId = stringToId(characterIdStr);

  const character = statelyClient.create("Character", {
    channelId,
    showId,
    characterId,
    name,
    role,
    description,
  });

  await statelyClient.put(character);
  revalidatePath(`/channels/${channelIdStr}/shows/${showIdStr}`);
}

export async function deleteCharacter(channelIdStr: string, showIdStr: string, characterIdStr: string) {
  const characterId = stringToId(characterIdStr);

  await statelyClient.del(keyPath`/character-${characterId}`);

  revalidatePath(`/channels/${channelIdStr}/shows/${showIdStr}`);
}
