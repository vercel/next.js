/**
 * StatelyDB Schema for StatelyTV
 *
 * This schema models a Netflix-style streaming application with channels, shows, and characters.
 * It uses StatelyDB's elastic schema format to define the data model and access patterns.
 */

import { itemType, string, timestampSeconds, type, uuid } from "@stately-cloud/schema";

export const ChannelId = type("ChannelId", uuid);
export const ShowId = type("ShowId", uuid);
export const CharacterId = type("CharacterId", uuid);

itemType("Channel", {
  keyPath: "/channel-:channelId",
  fields: {
    channelId: { type: ChannelId, initialValue: "uuid" },
    name: { type: string },
    description: { type: string },
    createdAt: { type: timestampSeconds, fromMetadata: "createdAtTime" },
    updatedAt: { type: timestampSeconds, fromMetadata: "lastModifiedAtTime" },
  }
})

itemType("Show", {
  keyPath: [
    "/show-:showId",
    "/channel-:channelId/show-:showId"
  ],
  fields: {
    channelId: { type: ChannelId },
    showId: { type: ShowId, initialValue: "uuid" },
    title: { type: string },
    description: { type: string },
    year: { type: string },
    createdAt: { type: timestampSeconds, fromMetadata: "createdAtTime" },
    updatedAt: { type: timestampSeconds, fromMetadata: "lastModifiedAtTime" },
  }
})

itemType("Character", {
  keyPath: [
    "/character-:characterId",
    "/channel-:channelId/show-:showId/character-:characterId"
  ],
  fields: {
    channelId: { type: ChannelId },
    showId: { type: ShowId },
    characterId: { type: CharacterId, initialValue: "uuid" },
    name: { type: string },
    role: { type: string },
    description: { type: string },
    createdAt: { type: timestampSeconds, fromMetadata: "createdAtTime" },
    updatedAt: { type: timestampSeconds, fromMetadata: "lastModifiedAtTime" },
  }
})