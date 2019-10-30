import React from 'react'
import Page from '../../components/page'
import Item from '../../components/item'
import getItem from '../../lib/get-item'
import getComments from '../../lib/get-comments'

// eslint-disable-next-line camelcase
export async function unstable_getStaticProps ({ params }) {
  const story = await getItem(params.id)
  return { props: { story } }
}

export default class extends React.Component {
  constructor (props) {
    super(props)
    this.state = {}
  }

  render () {
    const { story } = this.props
    const comments = this.state.comments || this.props.comments
    return <Page>
      <Item story={story} comments={comments} />
    </Page>
  }

  componentDidMount () {
    if (!this.props.comments) {
      // populate comments client side
      getComments(this.props.story.comments)
        .then((comments) => {
          this.setState({ comments })
        })
        .catch((err) => {
          console.error(err)
        })
    }
  }
}
