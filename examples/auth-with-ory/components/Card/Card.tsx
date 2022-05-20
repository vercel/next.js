import React from 'react'

import Image from 'next/image'

import styles from './Card.module.css'

interface Props {
  title: string
  children: React.ReactElement
}

const Card: React.VFC<Props> = ({ title, children }: Props) => {
  return (
    <article className={styles.card}>
      <div className={styles.imageContainer}>
        {React.cloneElement(children, {
          className: styles.thumbnail,
        })}
        <div className={styles.imageFooter}>
          <Image
            width={32}
            height={32}
            className={styles.category}
            src="/logo.jpg"
            alt="some image"
          />
          <div className={styles.time}>
            <svg
              viewBox="0 0 24 24"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
              width="16px"
              height="16px"
            >
              <path
                fillRule="evenodd"
                clipRule="evenodd"
                d="M12 24C5.384 24 0 18.617 0 12 0 5.384 5.384 0 12 0c6.617 0 12 5.384 12 12 0 6.617-5.383 12-12 12zm3.16-8.393a.924.924 0 00.557.185.928.928 0 00.559-1.673l-3.346-2.51V6.498a.93.93 0 00-1.86 0v5.577c0 .293.138.57.372.744l3.718 2.789z"
                fill="currentColor"
              ></path>
            </svg>
            <span>08:01</span>
          </div>
        </div>
      </div>
      <p className={styles.title}>{title}</p>
      <div className={styles.tags}>
        <div className={styles.contentType}>
          <div className={styles.tag}>
            <svg
              viewBox="0 0 16 24"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
              width="16px"
              height="16px"
            >
              <path
                fillRule="evenodd"
                clipRule="evenodd"
                d="M8.35714 6H4.78571H0.5C0.5 4.75735 1.45939 3.75 2.64286 3.75C2.64286 2.50735 3.60224 1.5 4.78571 1.5C5.13693 1.5 5.46835 1.58867 5.76088 1.74591C6.21315 0.715347 7.20558 0 8.35714 0C9.5087 0 10.5011 0.715347 10.9534 1.74591C11.2459 1.58867 11.5774 1.5 11.9286 1.5C13.112 1.5 14.0714 2.50735 14.0714 3.75C14.0714 3.79257 14.0703 3.83482 14.0681 3.8768C14.9021 4.18469 15.5 5.01901 15.5 6H11.2143H8.35714ZM15.3544 8.3179L13.9908 23.3179C13.9557 23.7042 13.6318 24 13.2439 24H2.6137C2.2258 24 1.9019 23.7042 1.86678 23.3179L0.503141 8.3179C0.463213 7.87869 0.809037 7.5 1.25006 7.5H14.6075C15.0485 7.5 15.3944 7.87869 15.3544 8.3179ZM11.6788 15.75C11.6788 17.8211 9.99985 19.5 7.92879 19.5C5.85772 19.5 4.17879 17.8211 4.17879 15.75C4.17879 13.6789 5.85772 12 7.92879 12C9.99985 12 11.6788 13.6789 11.6788 15.75Z"
                fill="currentColor"
              ></path>
            </svg>
            <p>Development</p>
          </div>
        </div>
        <div className={styles.richType}>
          <div className={styles.tag}>
            <svg
              width="16px"
              height="16px"
              viewBox="0 0 16 16"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
            >
              <path
                d="M7.8681 5.37633C4.45925 2.16938 -3.5 8.23216 8.0001 16C19.5002 8.23139 11.5402 2.16784 8.13211 5.3771C8.08646 5.41876 8.04242 5.46224 8.0001 5.50743C7.95735 5.4622 7.9131 5.4185 7.8681 5.37633Z"
                fill="#22463D"
              ></path>
              <path
                fillRule="evenodd"
                clipRule="evenodd"
                d="M10.476 0.81609C10.5571 0.776633 10.6538 0.788962 10.7223 0.847468C10.7909 0.905974 10.8183 0.999551 10.792 1.08579L9.93083 3.91872C9.90183 4.01418 9.81378 4.07943 9.71401 4.07943H6.08785C5.98807 4.07943 5.90004 4.01418 5.87102 3.91871L5.0098 1.08577C4.98359 0.99954 5.01097 0.905962 5.07953 0.847456C5.14809 0.788951 5.24479 0.776633 5.32585 0.816079L6.56604 1.41983L7.72972 0.0781438C7.77277 0.0285107 7.83523 0 7.90093 0C7.96663 0 8.02911 0.0285107 8.07214 0.0781438L9.23582 1.41985L10.476 0.81609Z"
                fill="currentColor"
              ></path>
            </svg>
            <p>Trending</p>
          </div>
        </div>
      </div>
      <div className={styles.user}>
        <Image
          width={32}
          height={32}
          className={styles.avatar}
          src="/logo.jpg"
          alt="Avatar"
        />
        <p>Acme Development</p>
      </div>
    </article>
  )
}

export default Card
