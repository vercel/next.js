import { ChunkId } from "./index";

export type ServerMessage = {
  chunkId: ChunkId;
} & (
  | {
      type: "restart";
    }
  | {
      type: "partial";
      instruction: string;
    }
  | {
      type: "future-type-marker-do-not-use-or-you-will-be-fired";
    }
);

export type ClientMessage = {
  type: "subscribe";
  chunkId: ChunkId;
};
