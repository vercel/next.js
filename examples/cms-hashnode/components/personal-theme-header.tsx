import { resizeImage } from '../utils/image'
import Link from 'next/link'
import { useAppContext } from './contexts/appContext'

export const PersonalHeader = () => {
  const { publication } = useAppContext()

  return (
    <header className="grid grid-cols-2 items-center gap-5 ">
      <div className="col-span-full md:col-span-1">
        <h1>
          <Link
            className="flex flex-row items-center gap-2 text-lg font-bold leading-tight tracking-tight text-black dark:text-white"
            href="/"
            aria-label={`${publication.author.name}'s blog home page`}
          >
            {publication.author.profilePicture && (
              <img
                className="block h-8 w-8 rounded-full fill-current"
                alt={publication.author.name}
                src={resizeImage(publication.author.profilePicture, {
                  w: 400,
                  h: 400,
                  c: 'face',
                })}
              />
            )}
            {publication.title}
          </Link>
        </h1>
      </div>
    </header>
  )
}
