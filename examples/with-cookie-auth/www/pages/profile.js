import fetch from 'isomorphic-unfetch'
import Layout from '../components/layout'
import auth, { withAuthSync } from '../utils/auth'

const Profile = withAuthSync(props => {
  const { name, login, bio, avatarUrl } = props.data

  console.log(props.data)

  return (
    <Layout>
      <img src={avatarUrl} alt='Avatar' />
      <h1>{name}</h1>
      <p className='lead'>{login}</p>
      <p>{bio}</p>

      <style jsx>{`
        img {
          max-width: 200px;
          border-radius: 0.5rem;
        }

        h1 {
          margin-bottom: 0;
        }

        .lead {
          margin-top: 0;
          font-size: 1.5rem;
          font-weight: 300;
          color: #666;
        }

        p {
          color: #6a737d;
        }
      `}</style>
    </Layout>
  )
})

Profile.getInitialProps = async ctx => {
  const token = auth(ctx)
  const apiUrl = `https://${ctx.req.headers.host}/api/profile.js`

  try {
    const response = await fetch(apiUrl, {
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
        Authorization: JSON.stringify({ token })
      }
    })

    console.log('apiurl: ', apiUrl)
    console.log(response)

    if (response.ok) {
      return await response.json()
    } else {
      // https://github.com/developit/unfetch#caveats
      return ctx.res.writeHead(302, { Location: '/login' })
    }
  } catch (error) {
    // Implementation or Network error
    throw new Error(error)
  }
}

export default Profile
