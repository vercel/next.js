const SkeletonCard = () => (
  <div className="space-y-3 rounded-2xl bg-gray-900/80 p-4">
    <div className="h-14 rounded-lg bg-gray-700" />
    <div className="h-3 w-3/12 rounded-lg bg-vercel-cyan" />
    <div className="h-3 w-11/12 rounded-lg bg-gray-700" />
    <div className="h-3 w-8/12 rounded-lg bg-gray-700" />
  </div>
)

export default function Page() {
  return (
    <div className="space-y-4">
      <h1 className="text-xl font-medium text-gray-400/80">
        Styled with Tailwind CSS
      </h1>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <SkeletonCard />
        <SkeletonCard />
        <SkeletonCard />
      </div>
    </div>
  )
}
