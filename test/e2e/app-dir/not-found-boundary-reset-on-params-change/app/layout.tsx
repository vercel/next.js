'use client'
import React from 'react'
import { useRouter } from 'next/navigation'

export default function Root({ children }: { children: React.ReactNode }) {
  const router = useRouter()

  return (
    <html>
      <head></head>
      <body>
        <header>
          <button
            id="home"
            onClick={() => {
              router.push('/')
            }}
          >
            /
          </button>
          <button
            id="sp-no-query"
            onClick={() => {
              router.push('/search-param')
            }}
          >
            /search-param
          </button>
          <button
            id="sp-q-200"
            onClick={() => {
              router.push('/search-param?q=200')
            }}
          >
            /search-param
          </button>
          <button
            id="sp-q-404"
            onClick={() => {
              router.push('/search-param?q=404')
            }}
          >
            /search-param?q=404
          </button>
        </header>
        {children}
      </body>
    </html>
  )
}
