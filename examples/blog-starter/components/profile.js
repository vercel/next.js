import { siteMeta } from '../blog.config'

const Profile = () => (
  <div className='h-card profile'>
    <img className='u-photo' src='/static/_jolvera.png' alt={siteMeta.author} />

    <div>
      <p>
        Hi, I'm{' '}
        <a className='u-url p-name' href={siteMeta.siteUrl} rel='me'>
          {siteMeta.author}
        </a>
      </p>
      <p className='p-note'>
        I'm a frontend developer &amp; web standards enthusiastic.
      </p>
    </div>
    <style jsx>{`
      .profile {
        display: flex;
        align-items: center;
        padding: 1em;
        background-color: #eee;
      }

      img {
        width: 5em;
        height: 5em;
        margin-right: 0.5em;
      }

      p:last-child {
        margin-bottom: 0;
      }
    `}</style>
  </div>
)

export default Profile
