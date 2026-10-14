import type { ReleaseChecklist, Rollout } from '@/lib/releases'

export function LaunchChecklist({
  checklist,
}: {
  checklist: ReleaseChecklist
}) {
  return (
    <section id="checks" data-testid="launch-checklist">
      <h2>{checklist.title}</h2>
      <ul>
        {checklist.items.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
    </section>
  )
}

export function LaunchChecklistSkeleton() {
  return (
    <section aria-label="Loading launch checklist">
      <h2>Launch checklist</h2>
      <p>Loading checks…</p>
    </section>
  )
}

export function LiveRollout({ rollout }: { rollout: Rollout }) {
  return (
    <section id="overview" data-testid="live-rollout">
      <h2>Live rollout</h2>
      <p>{rollout.percent}% deployed</p>
      <p>{rollout.region}</p>
    </section>
  )
}

export function LiveRolloutSkeleton() {
  return (
    <section aria-label="Loading live rollout" data-testid="rollout-skeleton">
      <h2>Live rollout</h2>
      <p>Loading current deployment…</p>
    </section>
  )
}
