import { ChunkPath } from "./index";

export type ServerMessage = {
  chunkPath: ChunkPath;
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
  chunkPath: ChunkPath;
};
