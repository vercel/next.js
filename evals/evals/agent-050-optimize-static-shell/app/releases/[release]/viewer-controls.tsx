export function ViewerControls({ viewer }: { viewer: string }) {
  return (
    <div data-testid="viewer-controls">
      Viewing as <strong>{viewer}</strong>
    </div>
  )
}

export function ViewerControlsSkeleton() {
  return (
    <div aria-label="Loading viewer controls" data-testid="viewer-skeleton">
      Loading viewer…
    </div>
  )
}
