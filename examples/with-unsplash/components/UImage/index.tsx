import styles from './UImage.module.css'
import UIcon from 'components/UIcon'

const Uimage = ({ id, urls, altDescription }) => {
  return (
    <div key={`uimg_container_${id}`}>
      <img className={styles.img} src={urls.small} alt={altDescription} />
      <div className={styles.actions}>
        <UIcon url={`/api/photo/download/${id}`} name="download" />
      </div>
    </div>
  )
}

export default Uimage
