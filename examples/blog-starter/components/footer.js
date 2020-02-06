import Profile from './profile'

function Footer() {
  return (
    <footer>
      <Profile className="profile-footer" />

      <p>
        Proudly built with <a href="https://nextjs.org">Next.js</a> -{' '}
        <a href="/feed.json">RSS Feed</a>
      </p>
      <style jsx>{`
        footer {
          padding: 1em 0;
        }

        p {
          margin-top: 2em;
        }
      `}</style>
    </footer>
  )
}

export default Footer
