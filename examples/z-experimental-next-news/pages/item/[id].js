import React, { useState, useEffect } from 'react'
import Page from '../../components/page'
import Item from '../../components/item'
import getItem from '../../lib/get-item'
import getComments from '../../lib/get-comments'

// eslint-disable-next-line camelcase
export async function unstable_getStaticProps ({ params }) {
  const story = await getItem(params.id)
  return { props: { story } }
}

function ItemPage ({ story }) {
  const [comments, setComments] = useState(null)
  useEffect(() => {
    getComments(story.comments)
      .then(comments => setComments(comments))
      .catch(err => console.error(err))
  }, [])
  return (
    <Page>
      <Item story={story} comments={comments} />
    </Page>
  )
}

export default ItemPage
