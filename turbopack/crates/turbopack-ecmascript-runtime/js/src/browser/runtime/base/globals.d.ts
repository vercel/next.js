type ChunkRegistry = {
  push: (registration: ChunkRegistration) => void
}

type ChunkListProvider = {
  push: (registration: ChunkList) => void
}

declare var TURBOPACK: ChunkRegistry | ChunkRegistration[] | undefined
declare var TURBOPACK_CHUNK_LISTS: ChunkListProvider | ChunkList[] | undefined
