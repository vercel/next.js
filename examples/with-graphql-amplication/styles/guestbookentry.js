import css from 'styled-jsx/css'

export const guestbookEntry = css.resolve`
  div {
    width: 100%;
    display: inline-flex;
    flex-direction: row;
    align-items: center;
    margin-bottom: 30px;
  }
`
export const guestbookEntryUserDetail = css.resolve`
  div {
    flex-shrink: 0;
    flex-basis: 30%;
    text-align: center;
  }
`
export const guestbookEntryUserDetailAvatar = css.resolve`
  div {
    display: inline-block;
    position: relative;
    margin-bottom: 5px;
    width: 70px;
    height: 70px;
  }
`
export const guestbookEntryUserDetailAvatarImg = css.resolve`
  img {
    position: absolute;
    width: 100%;
    height: 100%;
    left: 0;
    right: 0;
    top: 0;
    bottom: 0;
    border-radius: 50%;
    border: 2px solid rgba(50, 63, 203, 0.5);
    opacity: 0.75;
    transition: all 200ms ease-in-out;
  }

  img:hover {
    opacity: 1;
    border-color: rgba(50, 63, 203);
  }
`
export const guestbookEntryUserDetailBiolink = css.resolve`
  a {
    display: block;
    margin-bottom: 5px;
    text-decoration: none;
    color: rgba(50, 63, 203, 0.5);
    font-size: 70%;
    transition: color 200ms ease-in-out;
  }
  a:hover {
    color: rgba(50, 63, 203);
  }
`
export const guestbookEntryUserDetailTimestamp = css.resolve`
  span {
    display: block;
    font-size: 70%;
    font-weight: 200;
    color: gray;
  }
`
export const guestbookEntryStory = css.resolve`
  div {
    flex-shrink: 0;
    flex-basis: 60%;
    text-align: left;
    padding-right: 15px;
    white-space: pre-wrap;
  }
`
export const guestbookEntryShare = css.resolve`
  div {
    margin-bottom: 30px;
  }
`
export const guestbookEntryShareTwitterButton = css.resolve`
  a {
    display: inline-block;
    width: 20px;
    height: 20px;
    position: relative;
  }
`
export const guestbookEntryShareTwitterButtonLogo1 = css.resolve`
  img {
    position: absolute;
    width: 100%;
    height: 100%;
    opacity: 0.5;
  }
`
export const guestbookEntryShareTwitterButtonLogo2 = css.resolve`
  img {
    position: absolute;
    width: 100%;
    height: 100%;
    opacity: 0;
    transition: opacity 200ms ease-in-out;
  }
  img:hover {
    opacity: 1;
  }
`
