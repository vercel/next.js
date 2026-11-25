// @ts-nocheck -- every import is transformed by a loader configured in next.config.js
import c01 from './v.c01.txt'
import c02 from './v.c02.txt'
import c03 from './v.c03.txt'
import c04 from './v.c04.txt'
import c05 from './v.c05.txt'
import c06 from './v.c06.txt'
import c08 from './v.c08.txt'
import c09 from './v.c09.txt'
import c10 from './v.c10.txt'
import c11 from './resdir/v.c11.txt'
import c12 from './v.c12.txt'
import c13 from './v.c13.txt'
import c14 from './v.c14.txt'
import c16 from './v.c16.txt'

const values = {
  c01,
  c02,
  c03,
  c04,
  c05,
  c06,
  c08,
  c09,
  c10,
  c11,
  c12,
  c13,
  c14,
  c16,
}

export default function Page() {
  return (
    <>
      {Object.entries(values).map(([id, value]) => (
        <p key={id} id={id}>
          {value}
        </p>
      ))}
    </>
  )
}
