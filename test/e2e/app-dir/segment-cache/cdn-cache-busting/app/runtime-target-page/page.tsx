export const unstable_instant = {
  prefetch: 'runtime',
  samples: [{ cookies: [] }],
}

export default function RuntimeTargetPage() {
  return (
    <div id="runtime-target-page" data-testid="runtime-prefetch-result">
      Runtime target page
    </div>
  )
}
