export default function Avatar({ name, picture }) {
  return (
    <div className="flex items-center">
      <img
        src={picture.url}
        className="w-12 h-12 rounded-full mr-4"
        alt={name[0].text}
      />
      <div className="text-xl font-bold">{name}</div>
    </div>
  )
}
