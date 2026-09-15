export default function Loading() {
  return (
    <div id="two-fallback" data-fallback data-rendered-at={performance.now()}>
      loading two...
    </div>
  )
}
