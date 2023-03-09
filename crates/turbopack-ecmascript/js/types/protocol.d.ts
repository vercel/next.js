import { ChunkPath, ModuleFactoryString, ModuleId } from "./index";

export type ServerMessage = {
  resource: ResourceIdentifier;
  issues: Issue[];
} & (
  | {
      type: "restart";
    }
  | {
      type: "notFound";
    }
  | {
      type: "partial";
      instruction: PartialUpdate;
    }
  | {
      type: "issues";
    }
  | UnknownType
);

type UnknownType = {
  type: "future-type-marker-do-not-use-or-you-will-be-fired";
};

export type PartialUpdate =
  | ChunkListUpdate
  | {
      type: never;
    };

export type ChunkListUpdate = {
  type: "ChunkListUpdate";
  chunks?: Record<ChunkPath, ChunkUpdate>;
  merged?: MergedChunkUpdate[];
};

export type ChunkUpdate =
  | {
      type: "added";
    }
  | { type: "deleted" }
  | { type: "total" }
  // We currently don't have any chunks that can be updated partially that can't
  // be merged either. So these updates would go into `MergedChunkUpdate` instead.
  | { type: "partial"; instruction: never };

export type MergedChunkUpdate =
  | EcmascriptMergedUpdate
  | {
      type: never;
    };

export type EcmascriptMergedUpdate = {
  type: "EcmascriptMergedUpdate";
  entries?: Record<ModuleId, EcmascriptModuleEntry>;
  chunks?: Record<ChunkPath, EcmascriptMergedChunkUpdate>;
};

export type EcmascriptMergedChunkUpdate =
  | {
      type: "added";
      modules?: ModuleId[];
    }
  | {
      type: "deleted";
      modules?: ModuleId[];
    }
  | {
      type: "partial";
      added?: ModuleId[];
      deleted?: ModuleId[];
    }
  | {
      type: never;
    };

export type EcmascriptModuleEntry = {
  code: ModuleFactoryString;
  url: string;
  map?: string;
};

type ResourceIdentifier = {
  path: string;
  headers?: { [string]: string };
};

export type ClientMessageSubscribe = {
  type: "subscribe";
} & ResourceIdentifier;

export type ClientMessageUnsubscribe = {
  type: "unsubscribe";
} & ResourceIdentifier;

export type ClientMessage = ClientMessageSubscribe | ClientMessageUnsubscribe;

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
  detail: string;
  documentation_link: string;

  source: IssueSource | null;
  sub_issues: Issue[];
  formatted: string;
};
