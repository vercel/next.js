export default function Avatar({ name, picture }) {
  return (
    <div className="flex items-center">
      {picture && (
        <img
          src={`${picture}?auto=format,compress,enhance&w=100&h=100`}
          className="w-12 h-12 rounded-full mr-4"
          alt={name}
        />
      )}
      <div className="text-xl font-bold">{name}</div>
    </div>
  )
}
