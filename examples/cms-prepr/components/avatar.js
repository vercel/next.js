import Image from 'next/image'

export default function Avatar({ name, picture }) {
  return (
    <div className="flex items-center">
      <div className="relative mr-3 h-9 w-9 overflow-hidden rounded-full bg-primary-100">
        {picture && (
          <Image src={picture} fill className="object-cover" alt={name || ''} />
        )}
      </div>
      <div className="font-medium text-secondary-700">{name}</div>
    </div>
  )
}
