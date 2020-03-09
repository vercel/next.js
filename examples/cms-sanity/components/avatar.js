export default function Avatar({ name, url }) {
  return (
    <div className="flex items-center">
      <img src={url} className="w-12 h-12 rounded-full mr-4" alt={name} />
      <div className="text-xl font-bold">{name}</div>
    </div>
  )
}
