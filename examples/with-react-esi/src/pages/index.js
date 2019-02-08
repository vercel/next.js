import withESI from 'react-esi'
import React from 'react'
import Link from 'next/link'
import BreakingNews from '../components/BreakingNews'
import TopArticles from '../components/TopArticles'

const BreakingNewsESI = withESI(BreakingNews, 'BreakingNews')
const TopArticlesESI = withESI(TopArticles, 'TopArticles')

const Index = () => (
  <div>
    <h1>React ESI demo app</h1>
    <main>
      <p>Welcome to my news website!</p>
      <Link href='/article'>
        <a>Go to an article</a>
      </Link>
    </main>

    {/* TODO: introduce a layout */}
    <TopArticlesESI from='the main page' />
    <BreakingNewsESI />
  </div>
)

Index.getInitialProps = async function ({ res }) {
  if (res) res.set('Cache-Control', 's-maxage: 10')
  return {}
}

export default Index
