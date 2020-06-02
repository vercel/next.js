export default function Avatar({ name, picture }) {
  return (
    <div className="flex items-center">
      <img
        src={`${
          picture.url.startsWith('/') ? process.env.NEXT_PUBLIC_API_URL : ''
        }${picture.url}`}
        className="w-12 h-12 rounded-full mr-4 grayscale"
        alt={name}
      />
      <div className="text-xl font-bold">{name}</div>
    </div>
  )
}
