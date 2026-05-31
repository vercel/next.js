import s1 from '../../styles/dir2/style01.module.css'
import s2 from '../../styles/dir2/style02.module.css'
import s3 from '../../styles/dir2/style03.module.css'

const styles = [s1, s2, s3]

export default function Dir2() {
  return (
    <div>
      {styles.map((s, i) => (
        <p
          key={i}
          id={`dir2-file${String(i + 1).padStart(2, '0')}`}
          className={s.text}
        >
          dir2 file{String(i + 1).padStart(2, '0')}
        </p>
      ))}
    </div>
  )
}
