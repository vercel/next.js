import React from 'react'

/**
 * Return the top articles of the month. Can be cached 1 hour.
 */
export default class TopArticles extends React.Component {
  static async getInitialProps({ props, req, res }) {
    if (res) {
      // server side, cache this fragment for 1 hour
      res.set('Cache-Control', 'public, s-maxage=3600')
    }

    // Fetch the articles from a remote API, it may take some time...
    return new Promise(resolve => {
      // Simulate a delay (slow network, huge computation...)
      setTimeout(
        () =>
          resolve({
            ...props, // Props from the main page, passed through the internal fragment URL server-side
            articles: [
              {
                title: 'Lorem ipsum dolor',
                body: 'Phasellus aliquet pellentesque dolor nec volutpat.',
              },
              {
                title: 'Donec ut porttitor nisl',
                body: 'Praesent vel odio vel dui pellentesque sodales.',
              },
            ],
          }),
        2000
      )
    })
  }

  render() {
    return (
      <section>
        <h1>Top articles</h1>
        {this.props.articles &&
          this.props.articles.map((article, i) => (
            <article key={i}>
              <h1>{article.title}</h1>
              <p>{article.body}</p>
            </article>
          ))}
        This block has been generated the first time as an include of{' '}
        <b>{this.props.from}</b>.
        <div>
          <small>generated at {new Date().toISOString()}</small>
        </div>
      </section>
    )
  }
}
