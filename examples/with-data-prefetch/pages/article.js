import { Component } from 'react'
import fetch from 'isomorphic-unfetch'
import { format } from 'url'

export default class Article extends Component {
  static async getInitialProps({ req, query, pathname, isVirtualCall }) {
    const url = format({ pathname, query })

    // if we're not running server side
    // get the props from sessionStorage using the pathname + query as key
    // if we got something return it as an object
    if (!req) {
      const props = window.sessionStorage.getItem(url)
      if (props) {
        return JSON.parse(props)
      }
    }

    // fetch data as usual
    const responses = await Promise.all([
      fetch(`https://jsonplaceholder.typicode.com/posts/${query.id}`),
      fetch(`https://jsonplaceholder.typicode.com/posts/${query.id}/comments`),
    ])

    const [article, comments] = await Promise.all(
      responses.map(response => response.json())
    )

    const user = await fetch(
      `https://jsonplaceholder.typicode.com/users/${article.userId}`
    ).then(response => response.json())

    const props = { article, comments, user }

    // if the method is being called by our Link component
    // save props on sessionStorage using the full url (pathname + query)
    // as key and the serialized props as value
    if (isVirtualCall) {
      window.sessionStorage.setItem(url, JSON.stringify(props))
    }

    return props
  }

  render() {
    const { article, comments, user } = this.props

    return (
      <div>
        <h1>{article.title}</h1>
        <div>
          <a href={`mailto:${user.email}`}>{user.name}</a>
        </div>
        <p>{article.body}</p>
        <ul>
          {comments.map(comment => (
            <li key={comment.id}>
              {comment.body}
              <br />
              By <strong>{comment.name}</strong>
            </li>
          ))}
        </ul>
      </div>
    )
  }
}
