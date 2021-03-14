import styles from './GuestbookEntry.module.css'

export default function GuestbookEntry(props) {
  return (
    <>
      <div className={styles.guestbookEntry}>
        <div className={styles.guestbookEntryUserDetail}>
          <div className={styles.guestbookEntryUserDetailAvatar}>
            <a
              target="_blank"
              rel="noopener noreferrer"
              href={`https://twitter.com/${props.twitter_handle}/`}
            >
              <img
                className={styles.guestbookEntryUserDetailAvatarImg}
                src={`https://unavatar.now.sh/twitter/${props.twitter_handle}/`}
              />
            </a>
          </div>
          <a
            className={styles.guestbookEntryUserDetailBiolink}
            target="_blank"
            rel="noopener noreferrer"
            href={`https://twitter.com/${props.twitter_handle}/`}
          >
            {props.twitter_handle}
          </a>
          <span className={styles.guestbookEntryUserDetailTimestamp}>
            {props.date.toDateString()}
          </span>
        </div>
        <div className={styles.guestbookEntryStory}>{props.story}</div>
      </div>
      <div className={styles.guestbookEntryShare}>
        <a
          href={`http://twitter.com/share?text=${encodeURIComponent(
            props.story + ' @vercel'
          )}&hashtags=graphql,nextjs
                    `}
          target="_blank"
          rel="noopener noreferrer"
          className={styles.guestbookEntryShareTwitterButton}
        >
          <img
            src="/static/twitter_icon_black.png"
            className={styles.guestbookEntryShareTwitterButtonLogo1}
          />
          <img
            className={styles.guestbookEntryShareTwitterButtonLogo2}
            src="/static/twitter_icon_blue.png"
          />
        </a>
      </div>
    </>
  )
}
