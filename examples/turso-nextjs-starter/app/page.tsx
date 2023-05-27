import { tursoClient } from '@/utils/tursoClient'

export const runtime = 'edge'

export const metadata = {
  title: {
    absolute: 'Top Web Frameworks',
  },
  description: 'A Next.js and Turso starter template',
}

export interface Framework {
  name: string
  language: string
  url: string
  stars: number
  id: number
}

async function getData() {
  const res = await tursoClient.execute('select * from frameworks;')
  return {
    frameworks: res.rows as unknown as Framework[],
  }
}

export default async function Home(page: any) {
  const { frameworks } = await getData()
  let {
    searchParams: { city },
  } = page
  city = decodeURIComponent(city.replace(/\+/g, ' '))

  return (
    <>
      <h1 id="home">Top web frameworks</h1>

      {city && <p className="text-center text-gray-400 italic">{city}</p>}

      <div className="mb-32 flex flex-col text-center lg:mb-0 lg:text-left">
        <div className="mt-20 overflow-x-auto rounded-lg border border-gray-200 w-[80vw] max-w-2xl">
          <table className="w-full divide-y-2 divide-gray-200 text-sm">
            <thead>
              <tr>
                <th>Name</th>
                <th>Language</th>
                <th>GitHub Stars</th>
                <th>Repo</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {frameworks.map((framework) => (
                <tr key={framework.id}>
                  <td>{framework.name}</td>
                  <td>{framework.language}</td>
                  <td className="stars">{framework.stars}</td>
                  <td className="whitespace-nowrap text-center px-4 py-2">
                    <a
                      href={framework.url}
                      target="_blank"
                      className="group rounded-lg border border-transparent px-2 py-1 transition-colors hover:border-gray-300 hover:bg-gray-100 hover:dark:border-neutral-700 hover:dark:bg-neutral-800/30"
                    >
                      Visit 🔗
                    </a>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  )
}
