import styles from './GuestbookEntry.module.css'
import Image from 'next/image'

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
              <Image
                className={styles.guestbookEntryUserDetailAvatarImg}
                alt="Twitter profile image of guestbook entry author"
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
          <Image
            src="/static/twitter_icon_black.png"
            alt="Twitter share button"
            className={styles.guestbookEntryShareTwitterButtonLogo1}
          />
          <Image
            className={styles.guestbookEntryShareTwitterButtonLogo2}
            alt="Twitter share button"
            src="/static/twitter_icon_blue.png"
          />
        </a>
      </div>
    </>
  )
}
