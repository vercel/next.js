import styles from './UIcon.module.css'

const UIcon = ({ url, name }) => {
  return (
    <a
      className={styles.icon}
      href={url}
      target="_blank"
      rel="noopener noreferrer"
    >
      <img
        className={styles.icon_svg}
        src={`/images/${name}.svg`}
        alt={`${name} icon`}
      />
    </a>
  )
}

export default UIcon
