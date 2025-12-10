import './suspense-profiler.css'
import { useState, useMemo, useCallback } from 'react'
import type {
  SuspenseBoundaryData,
  SuspenseBoundaryInfo,
  DynamicAPIAccess,
} from '../../../../server/app-render/suspense-boundary-injector'

// Read suspense boundary data from the DOM (injected by server)
function getSuspenseDataFromDOM(): SuspenseBoundaryData | null {
  if (typeof document === 'undefined') return null

  const script = document.getElementById('__NEXT_SUSPENSE_BOUNDARIES__')
  if (!script) return null

  try {
    return JSON.parse(script.textContent || '{}')
  } catch {
    return null
  }
}

interface DynamicReason {
  expression: string
  layersBetween: number
  componentsBetween: string[]
}

function matchDynamicToBoundary(
  boundaries: SuspenseBoundaryInfo[],
  dynamicAccesses: DynamicAPIAccess[]
): Record<string, DynamicReason[]> {
  const boundaryReasons: Record<string, DynamicReason[]> = {}

  dynamicAccesses.forEach((api) => {
    if (!api.frames.length) return

    const apiFrames = api.frames.slice().reverse()
    const apiNames = apiFrames.map((f) => f.componentName)

    let bestMatch: string | null = null
    let bestMatchLen = 0
    let bestBoundaryLen = 0

    boundaries.forEach((b) => {
      if (!b.frames.length) return
      const boundaryFrames = b.frames.slice().reverse()
      const boundaryNames = boundaryFrames.map((f) => f.componentName)

      if (boundaryNames.length > apiNames.length) return

      let isPrefix = true
      for (let i = 0; i < boundaryNames.length; i++) {
        if (boundaryNames[i] !== apiNames[i]) {
          isPrefix = false
          break
        }
      }

      if (isPrefix && boundaryNames.length > bestMatchLen) {
        bestMatch = b.id
        bestMatchLen = boundaryNames.length
        bestBoundaryLen = boundaryNames.length
      }
    })

    if (bestMatch) {
      const layersBetween = apiNames.length - bestBoundaryLen
      const componentsBetween = apiNames.slice(bestBoundaryLen)

      if (!boundaryReasons[bestMatch]) boundaryReasons[bestMatch] = []

      // Dedupe by expression + trace path
      const traceKey = componentsBetween.join('>')
      const exists = boundaryReasons[bestMatch].some(
        (r) =>
          r.expression === api.expression &&
          r.componentsBetween.join('>') === traceKey
      )
      if (!exists) {
        boundaryReasons[bestMatch].push({
          expression: api.expression,
          layersBetween,
          componentsBetween,
        })
      }
    }
  })

  return boundaryReasons
}

function generatePrompt(
  suspenseComponent: string,
  reasons: DynamicReason[]
): string | null {
  const deepReasons = reasons.filter((r) => r.layersBetween > 0)
  if (deepReasons.length === 0) return null

  let prompt = `I have a React component structure where a Suspense boundary in "${suspenseComponent}" wraps dynamic API calls that are nested deep in the component tree. This causes more content than necessary to show loading states.\n\n`
  prompt += 'Current structure:\n'
  for (const r of deepReasons) {
    prompt += `- ${r.expression}() is called ${r.layersBetween} layers deep: ${r.componentsBetween.join(' > ')}\n`
  }
  prompt +=
    '\nPlease help me move the Suspense boundary closer to the dynamic API calls to minimize the loading state area. Show me the refactored code.'

  return prompt
}

function DynamicAPIRow({
  reason,
  depth,
  expandedTraces,
  onToggleTrace,
}: {
  reason: DynamicReason
  depth: number
  expandedTraces: Record<string, boolean>
  onToggleTrace: (key: string) => void
}) {
  const traceKey = `${reason.expression}-${reason.componentsBetween.join('-')}`
  const isTraceExpanded = expandedTraces[traceKey]
  const hasNestedLayers = reason.layersBetween > 0

  return (
    <div>
      <div
        className="suspense-profiler-api-row"
        style={{ paddingLeft: `${12 + depth * 16}px` }}
      >
        {hasNestedLayers ? (
          <button
            className="suspense-profiler-collapse-btn"
            onClick={() => onToggleTrace(traceKey)}
          >
            {isTraceExpanded ? '−' : '+'}
          </button>
        ) : (
          <span className="suspense-profiler-collapse-placeholder" />
        )}
        <code className="suspense-profiler-api-code">
          {reason.expression}()
          {hasNestedLayers && (
            <span className="suspense-profiler-layers-badge">
              {reason.layersBetween}
            </span>
          )}
        </code>
      </div>
      {isTraceExpanded && hasNestedLayers && (
        <div
          className="suspense-profiler-trace"
          style={{ paddingLeft: `${12 + depth * 16 + 16}px` }}
        >
          {reason.componentsBetween.map((comp, i) => (
            <div key={i} className="suspense-profiler-trace-item">
              {comp}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function SuspenseBoundaryRow({
  boundary,
  reasons,
  depth,
  expanded,
  expandedTraces,
  onToggle,
  onToggleTrace,
  onShowInsights,
}: {
  boundary: SuspenseBoundaryInfo
  reasons: DynamicReason[]
  depth: number
  expanded: boolean
  expandedTraces: Record<string, boolean>
  onToggle: () => void
  onToggleTrace: (key: string) => void
  onShowInsights: (prompt: string) => void
}) {
  const componentName =
    boundary.frames.length > 0 ? boundary.frames[0].componentName : 'Unknown'

  const hasReasons = reasons.length > 0
  const deepReasons = reasons.filter((r) => r.layersBetween > 0)
  const hasDeepReasons = deepReasons.length > 0
  const prompt = generatePrompt(componentName, reasons)

  return (
    <div>
      <div
        className="suspense-profiler-node-row"
        style={{ paddingLeft: `${12 + depth * 16}px` }}
        onClick={onToggle}
      >
        {hasReasons ? (
          <span className="suspense-profiler-toggle">
            {expanded ? '▼' : '▶'}
          </span>
        ) : (
          <span className="suspense-profiler-toggle-placeholder" />
        )}

        <span className="suspense-profiler-name">{componentName}</span>

        <span className="suspense-profiler-badge suspense-profiler-badge--suspense">
          suspense
        </span>

        {hasReasons && !hasDeepReasons && (
          <span className="suspense-profiler-status suspense-profiler-status--ok">
            ok
          </span>
        )}

        {prompt && (
          <button
            className="suspense-profiler-insights-btn"
            onClick={(e) => {
              e.stopPropagation()
              onShowInsights(prompt)
            }}
          >
            insights
          </button>
        )}
      </div>

      {expanded &&
        reasons.map((reason, i) => (
          <DynamicAPIRow
            key={i}
            reason={reason}
            depth={depth + 1}
            expandedTraces={expandedTraces}
            onToggleTrace={onToggleTrace}
          />
        ))}
    </div>
  )
}

function InsightsModal({
  prompt,
  onClose,
}: {
  prompt: string
  onClose: () => void
}) {
  const [copied, setCopied] = useState(false)

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(prompt).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }, [prompt])

  return (
    <div className="suspense-profiler-modal-overlay" onClick={onClose}>
      <div
        className="suspense-profiler-modal"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="suspense-profiler-modal-header">
          <span className="suspense-profiler-modal-title">
            Optimization Suggestion
          </span>
          <button className="suspense-profiler-modal-close" onClick={onClose}>
            ×
          </button>
        </div>
        <div className="suspense-profiler-modal-content">{prompt}</div>
        <button className="suspense-profiler-modal-copy" onClick={handleCopy}>
          {copied ? 'Copied!' : 'Copy to Clipboard'}
        </button>
      </div>
    </div>
  )
}

export function SuspenseProfiler() {
  const [expanded, setExpanded] = useState<Record<string, boolean>>({})
  const [expandedTraces, setExpandedTraces] = useState<Record<string, boolean>>(
    {}
  )
  const [insightsPrompt, setInsightsPrompt] = useState<string | null>(null)

  // Read data from DOM on mount
  const data = useMemo(() => getSuspenseDataFromDOM(), [])

  const boundaries = useMemo(() => data?.boundaries || [], [data?.boundaries])
  const dynamicAccesses = useMemo(
    () => data?.dynamicAccesses || [],
    [data?.dynamicAccesses]
  )

  // Match all boundaries, then merge reasons by component path
  const allBoundaryReasons = useMemo(() => {
    return matchDynamicToBoundary(boundaries, dynamicAccesses)
  }, [boundaries, dynamicAccesses])

  // Deduplicate boundaries by their component stack path, merging reasons
  const { uniqueBoundaries, boundaryReasons } = useMemo(() => {
    const seen = new Map<
      string,
      { boundary: SuspenseBoundaryInfo; reasons: DynamicReason[] }
    >()
    for (const b of boundaries) {
      const key = b.frames.map((f) => f.componentName).join('>')
      const reasons = allBoundaryReasons[b.id] || []
      if (!seen.has(key)) {
        seen.set(key, { boundary: b, reasons: [...reasons] })
      } else {
        // Merge reasons from duplicate boundaries
        const existing = seen.get(key)!
        for (const r of reasons) {
          const traceKey = r.componentsBetween.join('>')
          const exists = existing.reasons.some(
            (er) =>
              er.expression === r.expression &&
              er.componentsBetween.join('>') === traceKey
          )
          if (!exists) {
            existing.reasons.push(r)
          }
        }
      }
    }
    const result: {
      boundary: SuspenseBoundaryInfo
      reasons: DynamicReason[]
    }[] = []
    const reasonsMap: Record<string, DynamicReason[]> = {}
    for (const [, entry] of seen) {
      result.push(entry)
      reasonsMap[entry.boundary.id] = entry.reasons
    }
    return {
      uniqueBoundaries: result.map((e) => e.boundary),
      boundaryReasons: reasonsMap,
    }
  }, [boundaries, allBoundaryReasons])

  const handleToggle = useCallback((id: string) => {
    setExpanded((prev) => ({
      ...prev,
      [id]: !prev[id],
    }))
  }, [])

  const handleToggleTrace = useCallback((key: string) => {
    setExpandedTraces((prev) => ({
      ...prev,
      [key]: !prev[key],
    }))
  }, [])

  const handleShowInsights = useCallback((prompt: string) => {
    setInsightsPrompt(prompt)
  }, [])

  const handleCloseInsights = useCallback(() => {
    setInsightsPrompt(null)
  }, [])

  return (
    <div className="suspense-profiler">
      <div className="suspense-profiler-header">
        <span className="suspense-profiler-header-title">
          Suspense Boundaries
        </span>
        <div className="suspense-profiler-stats">
          <span className="suspense-profiler-stat">
            <span className="suspense-profiler-stat-value">
              {boundaries.length}
            </span>{' '}
            suspense
          </span>
          {dynamicAccesses.length > 0 && (
            <span className="suspense-profiler-stat">
              <span className="suspense-profiler-stat-value">
                {dynamicAccesses.length}
              </span>{' '}
              dynamic
            </span>
          )}
        </div>
      </div>

      <div className="suspense-profiler-content">
        {uniqueBoundaries.length === 0 ? (
          <div className="suspense-profiler-empty">No boundaries detected</div>
        ) : (
          uniqueBoundaries.map((boundary) => (
            <SuspenseBoundaryRow
              key={boundary.id}
              boundary={boundary}
              reasons={boundaryReasons[boundary.id] || []}
              depth={1}
              expanded={expanded[boundary.id] ?? true}
              expandedTraces={expandedTraces}
              onToggle={() => handleToggle(boundary.id)}
              onToggleTrace={handleToggleTrace}
              onShowInsights={handleShowInsights}
            />
          ))
        )}
      </div>

      {insightsPrompt && (
        <InsightsModal prompt={insightsPrompt} onClose={handleCloseInsights} />
      )}
    </div>
  )
}
