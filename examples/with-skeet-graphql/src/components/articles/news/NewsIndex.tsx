import { useTranslation } from 'next-i18next'
import Image from 'next/image'
import Link from '@/components/routing/Link'
import type { NewsIndex } from '@/types/article'
import TopNewsRow from './TopNewsRow'

type Props = {
  articles: NewsIndex[]
  urls: string[]
}

export default function NewsIndex({ articles, urls }: Props) {
  const { t } = useTranslation()

  return (
    <>
      <div className="pb-24 sm:pb-32">
        <div className="mx-auto max-w-7xl px-6 lg:px-8">
          <TopNewsRow articles={articles.slice(0, 4)} urls={urls} />
          <div className="mx-auto mt-16 grid max-w-2xl grid-cols-1 gap-y-20 gap-x-8 lg:mx-0 lg:max-w-none lg:grid-cols-3">
            {articles.slice(4).map((article, index) => (
              <article
                key={`NewsIndex Article${article.title}`}
                className="group flex flex-col items-start justify-between hover:cursor-pointer"
              >
                <Link href={urls[index + 4]}>
                  <div className="relative w-full">
                    <Image
                      src={article.thumbnail}
                      alt={article.title}
                      width="16"
                      height="9"
                      className="aspect-video w-full bg-gray-50 object-cover group-hover:opacity-80 dark:bg-gray-800"
                      unoptimized
                    />
                  </div>
                  <div className="max-w-xl">
                    <div className="mt-8 flex items-center gap-x-4 text-xs">
                      <time
                        dateTime={article.date}
                        className="text-gray-500 group-hover:text-gray-700 dark:text-gray-300 dark:group-hover:text-gray-500"
                      >
                        {article.date}
                      </time>
                      <span className="relative bg-gray-600 py-1.5 px-3 font-medium text-white group-hover:bg-gray-400 dark:bg-gray-400  dark:text-gray-50 dark:group-hover:bg-gray-700">
                        {article.category}
                      </span>
                    </div>
                    <div className="relative">
                      <h3 className="mt-3 text-lg font-semibold leading-6 text-gray-900 group-hover:text-gray-600 dark:text-gray-50 dark:group-hover:text-gray-300">
                        <span className="absolute inset-0" />
                        {article.title}
                      </h3>
                    </div>
                  </div>
                </Link>
              </article>
            ))}
          </div>
        </div>
      </div>
    </>
  )
}
