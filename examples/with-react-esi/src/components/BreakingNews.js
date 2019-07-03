import React from 'react'

// functional component
const BreakingNews = props => (
  <section>
    <h1>Breaking News</h1>
    {props.news &&
      props.news.map((breaking, i) => (
        <article key={i}>
          <h1>{breaking.title}</h1>
          <p>{breaking.body}</p>
        </article>
      ))}
    We are{' '}
    <b>{typeof window !== 'undefined' ? 'client-side' : 'server-side'}</b> (now,
    check the source of this page)
    <div>
      <small>generated at {new Date().toISOString()}</small>
    </div>
  </section>
)

BreakingNews.getInitialProps = async ({ props, req, res }) => {
  if (res) {
    // server-side, we always want to serve fresh data for this block!
    res.set('Cache-Control', 's-maxage=0, maxage=0')
  }

  return new Promise(resolve =>
    // Simulate a delay (slow network, huge computation...)
    setTimeout(
      () =>
        resolve({
          ...props, // Props from the main page, passed through the internal fragment URL server-side
          news: [
            {
              title: 'Aenean eleifend ex',
              body: 'Proin commodo ullamcorper cursus.'
            },
            {
              title: 'Morbi rutrum tortor nec eros vestibulum',
              body: 'Maecenas gravida eu sapien quis sollicitudin.'
            }
          ]
        }),
      5000
    )
  )
}

export default BreakingNews
