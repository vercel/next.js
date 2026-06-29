import s0 from '../s0.stress'
import s1 from '../s1.stress'
import s2 from '../s2.stress'
import s3 from '../s3.stress'

export default function Page() {
  const total = [s0, s1, s2, s3].reduce((a, b) => a + b, 0)
  return 'STRESS_OK total=' + total
}
