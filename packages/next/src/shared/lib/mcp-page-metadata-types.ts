import type { SegmentTrieNode } from '../../next-devtools/dev-overlay/segment-explorer-trie'

export type SegmentTrieData = {
  segmentTrie: SegmentTrieNode | null
  routerType: 'app' | 'pages'
}

export type PageSegment = {
  type: string
  pagePath: string
  boundaryType: string | null
}

export type PageMetadata = {
  segments: PageSegment[]
  routerType: 'app' | 'pages'
}

export type PageMetadataWithUrl = {
  url: string
  metadata: PageMetadata | null
}

export interface McpPageMetadataResponse {
  event: string
  requestId: string
  segmentTrieData: SegmentTrieData | null
  url: string
}
