export default function ParallelLayout({
  children,
  team,
  analytics,
}: {
  children: React.ReactNode
  team: React.ReactNode
  analytics: React.ReactNode
}) {
  return (
    <div>
      <div id="parallel-children">{children}</div>
      <div id="parallel-team">{team}</div>
      <div id="parallel-analytics">{analytics}</div>
    </div>
  )
}
