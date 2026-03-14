import s1 from '../../styles/dir4/style01.module.css'
import s2 from '../../styles/dir4/style02.module.css'
import s3 from '../../styles/dir4/style03.module.css'

const styles = [s1, s2, s3]

export default function Dir4() {
  return (
    <div>
      {styles.map((s, i) => (
        <p
          key={i}
          id={`dir4-file${String(i + 1).padStart(2, '0')}`}
          className={s.text}
        >
          dir4 file{String(i + 1).padStart(2, '0')}
        </p>
      ))}
    </div>
  )
}
