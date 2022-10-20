import { ChunkPath, ModuleFactoryString, ModuleId } from "./index";

export type ServerMessage = {
  chunkPath: ChunkPath;
  issues: Issue[];
} & (
  | {
      type: "restart";
    }
  | {
      type: "partial";
      instruction: EcmascriptChunkUpdate;
    }
  | {
      type: "issues";
    }
  | UnknownType
);

type UnknownType = {
  type: "future-type-marker-do-not-use-or-you-will-be-fired";
};

export type EcmascriptChunkUpdate = {
  type: "EcmascriptChunkUpdate";
  added: Record<ModuleId, HmrUpdateEntry>;
  modified: Record<ModuleId, HmrUpdateEntry>;
  deleted: ModuleId[];
};

export type HmrUpdateEntry = {
  code: ModuleFactoryString;
  map?: string;
};

export type ClientMessage = {
  type: "subscribe";
  chunkPath: ChunkPath;
};

export type IssueSeverity =
  | "bug"
  | "fatal"
  | "error"
  | "warning"
  | "hint"
  | "note"
  | "suggestion"
  | "info";

export type IssueAsset = {
  path: string;
};

export type SourcePos = {
  line: number;
  column: number;
};

export type IssueSource = {
  asset: IssueAsset;
  start: SourcePos;
  end: SourcePos;
};

export type Issue = {
  severity: IssueSeverity;
  context: string;
  category: string;
  title: string;
  description: string;
  documentation_link: string;
  source: IssueSource | null;
  sub_issues: Issue[];
  formatted: string;
};
