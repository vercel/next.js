export default function ReadTime({ minutes }) {
  if (!minutes) return null
  return (
    <span className="text-sm font-medium text-secondary-500">
      {minutes} min read
    </span>
  )
}
