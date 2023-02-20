import './globals.css'

import Link from 'next/link'

import { graphql } from '../gql'
import { grafbase } from '../lib/grafbase'

export const revalidate = 0

const GetAllPostsDocument = graphql(/* GraphQL */ `
  query GetAllPosts($first: Int!) {
    postCollection(first: $first) {
      edges {
        node {
          id
          title
          slug
        }
      }
    }
  }
`)

const RootLayout = async ({ children }: { children: React.ReactNode }) => {
  const { postCollection } = await grafbase.request(GetAllPostsDocument, {
    first: 50,
  })

  return (
    <html lang="en">
      <head>
        <title>Grafbase + Next.js 13</title>
      </head>
      <body>
        <div className="flex">
          <nav className="w-[350px] flex flex-col justify-between h-screen overflow-y-auto bg-gray-100">
            <ul className="p-8 space-y-2">
              <li className="mb-6">
                <Link
                  href="/"
                  className="py-2 rounded-md shadow-sm block px-3 text-gray-600 hover:text-gray-800 transition bg-white"
                >
                  Home
                </Link>
              </li>
              <li className="px-3 py-2 uppercase text-xs text-gray-800 font-semibold">
                Posts
              </li>
              {postCollection?.edges?.map((edge) =>
                edge?.node ? (
                  <li key={edge.node.id}>
                    <Link
                      href={`/posts/${edge.node.slug}`}
                      className="py-2 rounded-md shadow-sm block px-3 text-gray-600 hover:text-gray-800 transition bg-white"
                    >
                      {edge.node.title}
                    </Link>
                  </li>
                ) : null
              )}
              <li>
                <Link
                  href="/posts/not-found"
                  className="py-2 rounded-md shadow-sm block px-3 text-gray-600 hover:text-gray-800 transition bg-white"
                >
                  Show 404 page
                </Link>
              </li>
            </ul>
          </nav>
          <main className="flex-1 p-6 md:p-24">
            <div className="max-w-3xl mx-auto">
              <div className="prose max-w-none">{children}</div>
            </div>
          </main>
        </div>
      </body>
    </html>
  )
}

export default RootLayout
