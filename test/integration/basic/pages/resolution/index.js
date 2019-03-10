import Link from 'next/link'

export default () => (
  <div className='trailing-slash-link'>
    <Link href='/resolution/subfolder1'>
      <a id='subfolder1'>subfolder 1</a>
    </Link>
    <Link href='/resolution/subfolder1/'>
      <a id='subfolder1-slash'>subfolder 1 with slash</a>
    </Link>
    <Link href='/resolution/subfolder1/index'>
      <a id='subfolder1-index'>subfolder 1 with index</a>
    </Link>
    <Link href='/resolution/subfolder2'>
      <a id='subfolder2'>subfolder 2</a>
    </Link>
    <Link href='/resolution/subfolder2/'>
      <a id='subfolder2-slash'>subfolder 2 with slash</a>
    </Link>
    <Link href='/resolution/subfolder2/index'>
      <a id='subfolder2-index'>subfolder 2 with index</a>
    </Link>
  </div>
)
