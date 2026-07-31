/**
 * Definitions for the protocol that is used to communicate between the
 * Turbopack runtime and the Turbopack server for issue reporting and HMR.
 *
 * SOURCE OF TRUTH for the HMR update-instruction types below (`PartialUpdate`,
 * `ChunkListUpdate`, `ChunkUpdate`, `MergedChunkUpdate`, `EcmascriptMergedUpdate`,
 * `EcmascriptMergedChunkUpdate`, `EcmascriptModuleEntry`): the Rust structs in
 * `turbopack/crates/turbopack-ecmascript/src/chunk_list`, generated to TypeScript
 * at `packages/next/src/build/swc/generated-hmr-types.ts` (via
 * `pnpm swc-generate-hmr-types`). These ambient runtime declarations use
 * branded key types (`ChunkPath` / `ModuleId`) and a couple of runtime-only
 * refinements, so they are kept as a hand-written mirror rather than replaced by
 * the generated module; keep them consistent with the generated types when the
 * wire format changes.
 */
type PartialServerMessage = {
  resource: ResourceIdentifier
  issues: Issue[]
  type: 'partial'
  instruction: PartialUpdate
}

// string encoding of a module factory (used in hmr updates)
type ModuleFactoryString = string

type ServerMessage = {
  resource: ResourceIdentifier
  issues: Issue[]
} & (
  | {
      type: 'restart'
    }
  | {
      type: 'notFound'
    }
  | PartialServerMessage
  | {
      type: 'issues'
    }
  | UnknownType
)

type UnknownType = {
  type: 'future-type-marker-do-not-use-or-you-will-be-fired'
}

type PartialUpdate =
  | ChunkListUpdate
  | {
      type: never
    }

type ChunkListUpdate = {
  type: 'ChunkListUpdate'
  chunks?: Record<ChunkPath, ChunkUpdate>
  merged?: MergedChunkUpdate[]
}

type ChunkUpdate =
  | {
      type: 'added'
    }
  | { type: 'deleted' }
  | { type: 'total' }
  // We currently don't have any chunks that can be updated partially that can't
  // be merged either. So these updates would go into `MergedChunkUpdate` instead.
  | { type: 'partial'; instruction: never }

type MergedChunkUpdate =
  | EcmascriptMergedUpdate
  | {
      type: never
    }

type EcmascriptMergedUpdate = {
  type: 'EcmascriptMergedUpdate'
  entries?: Record<ModuleId, EcmascriptModuleEntry>
  chunks?: Record<ChunkPath, EcmascriptMergedChunkUpdate>
}

type EcmascriptMergedChunkUpdate =
  | {
      type: 'added'
      modules?: ModuleId[]
    }
  | {
      type: 'deleted'
      modules?: ModuleId[]
    }
  | {
      type: 'partial'
      added?: ModuleId[]
      deleted?: ModuleId[]
    }
  | {
      type: never
    }

type EcmascriptModuleEntry = {
  code: ModuleFactoryString
  url: string
  map?: string
}

type ResourceIdentifier = {
  path: string
  headers?: { [key: string]: string }
}

type ClientMessageSubscribe = {
  type: 'turbopack-subscribe'
} & ResourceIdentifier

type ClientMessageUnsubscribe = {
  type: 'turbopack-unsubscribe'
} & ResourceIdentifier

type ClientMessage = ClientMessageSubscribe | ClientMessageUnsubscribe

type IssueSeverity =
  | 'bug'
  | 'fatal'
  | 'error'
  | 'warning'
  | 'hint'
  | 'note'
  | 'suggestion'
  | 'info'

type IssueAsset = {
  path: string
}

type SourcePos = {
  line: number
  column: number
}

type IssueSource = {
  asset: IssueAsset
  range?: IssueSourceRange
}

type IssueSourceRange = {
  start: SourcePos
  end: SourcePos
}

type Issue = {
  severity: IssueSeverity
  file_path: string
  category: string

  title: string
  description: string
  detail: string
  documentation_link: string

  source: IssueSource | null
  sub_issues: Issue[]
  formatted: string
}
