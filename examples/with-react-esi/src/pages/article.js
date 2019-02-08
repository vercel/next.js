import withESI from 'react-esi'
import React from 'react'
import Link from 'next/link'
import BreakingNews from '../components/BreakingNews'
import TopArticles from '../components/TopArticles'
import Weather from '../components/Weather'

const BreakingNewsESI = withESI(BreakingNews, 'BreakingNews')
const TopArticlesESI = withESI(TopArticles, 'TopArticles')
const WeatherESI = withESI(Weather, 'Weather')

const Article = () => (
  <div>
    <h1>An article</h1>
    <main>This a specific article of the website!</main>

    {/* TODO: introduce a layout */}
    <TopArticlesESI from='the article page' />
    <BreakingNewsESI />
    <WeatherESI />

    <Link href='/'>
      <a>Go back to the homepage</a>
    </Link>
  </div>
)

Article.getInitialProps = async function ({ res }) {
  if (res) res.set('Cache-Control', 's-maxage: 10, maxage: 0')
  return {}
}

export default Article
