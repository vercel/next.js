import {
  guestbookEntry,
  guestbookEntryUserDetail,
  guestbookEntryUserDetailAvatar,
  guestbookEntryUserDetailAvatarImg,
  guestbookEntryUserDetailTimestamp,
  guestbookEntryUserDetailBiolink,
  guestbookEntryStory,
  guestbookEntryShare,
  guestbookEntryShareTwitterButton,
  guestbookEntryShareTwitterButtonLogo1,
  guestbookEntryShareTwitterButtonLogo2,
} from '../styles/guestbookentry'

export default props => (
  <>
    <div className={guestbookEntry.className}>
      <div className={guestbookEntryUserDetail.className}>
        <div className={guestbookEntryUserDetailAvatar.className}>
          <a
            target="_blank"
            href={`https://twitter.com/${props.twitter_handle}/`}
          >
            <img
              className={guestbookEntryUserDetailAvatarImg.className}
              src={`https://avatars.io/twitter/${props.twitter_handle}/`}
            />
          </a>
        </div>
        <a
          className={guestbookEntryUserDetailBiolink.className}
          target="_blank"
          href={`https://twitter.com/${props.twitter_handle}/`}
        >
          {props.twitter_handle}
        </a>
        <span className={guestbookEntryUserDetailTimestamp.className}>
          {props.date.toDateString()}
        </span>
      </div>
      <div className={guestbookEntryStory.className}>{props.story}</div>
    </div>
    <div className={guestbookEntryShare.className}>
      <a
        href={`http://twitter.com/share?text=${encodeURIComponent(
          props.story + ' @faunadb @zeithq'
        )}&url=${encodeURIComponent(
          'https://fauna.com'
        )}&hashtags=graphql,nextjs
                    `}
        target="_blank"
        className={guestbookEntryShareTwitterButton.className}
      >
        <img
          src="/static/twitter_icon_black.png"
          className={guestbookEntryShareTwitterButtonLogo1.className}
        />
        <img
          className={guestbookEntryShareTwitterButtonLogo2.className}
          src="/static/twitter_icon_blue.png"
        />
      </a>
    </div>
    {guestbookEntry.styles}
    {guestbookEntryShare.styles}
    {guestbookEntryShareTwitterButton.styles}
    {guestbookEntryShareTwitterButtonLogo1.styles}
    {guestbookEntryShareTwitterButtonLogo2.styles}
    {guestbookEntryStory.styles}
    {guestbookEntryUserDetail.styles}
    {guestbookEntryUserDetailAvatar.styles}
    {guestbookEntryUserDetailAvatarImg.styles}
    {guestbookEntryUserDetailBiolink.styles}
    {guestbookEntryUserDetailTimestamp.styles}
  </>
)
