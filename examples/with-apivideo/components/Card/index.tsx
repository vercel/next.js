import React from 'react'
import Image from 'next/image'
import styles from './Card.module.css'

interface ICardProps {
  content: string
  url: string
  method: 'get' | 'post'
}

const Card: React.FC<ICardProps> = ({ content, url, method }): JSX.Element => (
  <a className={styles.container} target="_blank" href={url} rel="noreferrer">
    <div className={`${method === 'get' ? styles.get : styles.post}`}>
      {method.toUpperCase()}
    </div>
    <p>{content}</p>
    <div className={styles.image_container}>
      <Image src="/arrow.png" alt="Sketch arrow" width={20} height={20} />
      <p>Try it out with our API!</p>
    </div>
  </a>
)

export default Card
