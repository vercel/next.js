/**
 * Definitions for the protocol that is used to communicate between the
 * Turbopack runtime and the Turbopack server for issue reporting and HMR.
 */

type ServerMessage = {
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

type PartialUpdate =
  | ChunkListUpdate
  | {
      type: never;
    };

type ChunkListUpdate = {
  type: "ChunkListUpdate";
  chunks?: Record<ChunkPath, ChunkUpdate>;
  merged?: MergedChunkUpdate[];
};

type ChunkUpdate =
  | {
      type: "added";
    }
  | { type: "deleted" }
  | { type: "total" }
  // We currently don't have any chunks that can be updated partially that can't
  // be merged either. So these updates would go into `MergedChunkUpdate` instead.
  | { type: "partial"; instruction: never };

type MergedChunkUpdate =
  | EcmascriptMergedUpdate
  | {
      type: never;
    };

type EcmascriptMergedUpdate = {
  type: "EcmascriptMergedUpdate";
  entries?: Record<ModuleId, EcmascriptModuleEntry>;
  chunks?: Record<ChunkPath, EcmascriptMergedChunkUpdate>;
};

type EcmascriptMergedChunkUpdate =
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

type EcmascriptModuleEntry = {
  code: ModuleFactoryString;
  url: string;
  map?: string;
};

type ResourceIdentifier = {
  path: string;
  headers?: { [string]: string };
};

type ClientMessageSubscribe = {
  type: "subscribe";
} & ResourceIdentifier;

type ClientMessageUnsubscribe = {
  type: "unsubscribe";
} & ResourceIdentifier;

type ClientMessage = ClientMessageSubscribe | ClientMessageUnsubscribe;

type IssueSeverity =
  | "bug"
  | "fatal"
  | "error"
  | "warning"
  | "hint"
  | "note"
  | "suggestion"
  | "info";

type IssueAsset = {
  path: string;
};

type SourcePos = {
  line: number;
  column: number;
};

type IssueSource = {
  asset: IssueAsset;
  start: SourcePos;
  end: SourcePos;
};

type Issue = {
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
