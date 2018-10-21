import Link from 'next/link'

const UnexpectedNestedA = () => {
  const UnexpectedWrapper = props => {
    const { href, id } = props
    const safeProps = { href, id }
    return <a {...safeProps}>{props.children}</a>
  }

  return UnexpectedWrapper
}

const FakeA = UnexpectedNestedA()

export default () => (
  <div className='nav-pass-href-prop'>
    <Link href='/nav' passHref>
      <FakeA id='with-href'>Will redirect as an `a` tag</FakeA>
    </Link>

    <Link href='/nav'>
      <FakeA id='without-href'>Will not redirect as an `a` tag</FakeA>
    </Link>

    <p>This is the passHref prop page.</p>
  </div>
)
