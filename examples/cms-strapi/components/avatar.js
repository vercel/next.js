import { API_URL } from '../lib/constants'

export default function Avatar({ name, picture }) {
  return (
    <div className="flex items-center">
      <img
        src={`${API_URL}${picture.url}`}
        className="w-12 h-12 rounded-full mr-4"
        alt={name}
      />
      <div className="text-xl font-bold">{name}</div>
    </div>
  )
}
