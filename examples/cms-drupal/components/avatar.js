import Image from 'next/image'

export default function Avatar({ author }) {
  const name = author
    ? author.firstName && author.lastName
      ? `${author.firstName} ${author.lastName}`
      : author.name
    : null

  return (
    <>
      {author && (
        <div className="flex items-center">
          <div className="w-12 h-12 relative mr-4">
            <Image
              src={author.avatar.url}
              layout="fill"
              className="w-12 h-12 rounded-full mr-4"
              alt={name}
            />
          </div>
          <div className="text-xl font-bold">{name}</div>
        </div>
      )}
    </>
  )
}
