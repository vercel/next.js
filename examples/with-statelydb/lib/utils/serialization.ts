import { idToString, timestampToDate } from "./idHelpers";
import type { Channel as StatelyChannel, Show as StatelyShow, Character as StatelyCharacter } from "@/lib/schema/stately_pb";
import type { Channel, Show, Character } from "@/lib/types";

function makeItemSerializable(obj: Record<string, any>): Record<string, any> {
  const newObj = Object.fromEntries(
    Object.entries(obj).map(([key, value]) => {
      if (value instanceof Uint8Array) {
        return [key, idToString(value)];
      }
      return [key, value];
    })
  );
  return newObj;
}

/**
 * Convert a StatelyDB Channel to a simplified Channel type for client/server boundary
 */
export function toChannel(statelyChannel: StatelyChannel): Channel {
  return {
    id: idToString(statelyChannel.channelId),
    name: statelyChannel.name,
    description: statelyChannel.description,
    createdAt: timestampToDate(statelyChannel.createdAt),
    updatedAt: timestampToDate(statelyChannel.updatedAt),
  };
}

/**
 * Convert a StatelyDB Show to a simplified Show type for client/server boundary
 */
export function toShow(statelyShow: StatelyShow): Show {
  return {
    id: idToString(statelyShow.showId),
    channelId: idToString(statelyShow.channelId),
    title: statelyShow.title,
    description: statelyShow.description,
    year: parseInt(statelyShow.year, 10),
    createdAt: timestampToDate(statelyShow.createdAt),
    updatedAt: timestampToDate(statelyShow.updatedAt),
  };
}

/**
 * Convert a StatelyDB Character to a simplified Character type for client/server boundary
 */
export function toCharacter(statelyCharacter: StatelyCharacter): Character {
  return {
    id: idToString(statelyCharacter.characterId),
    channelId: idToString(statelyCharacter.channelId),
    showId: idToString(statelyCharacter.showId),
    name: statelyCharacter.name,
    role: statelyCharacter.role,
    description: statelyCharacter.description,
    createdAt: timestampToDate(statelyCharacter.createdAt),
    updatedAt: timestampToDate(statelyCharacter.updatedAt),
  };
}
