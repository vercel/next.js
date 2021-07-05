import Link from 'next/link'

const ButtonLink = () => (
  <div id="button-link-page">
    <div>
      <Link href="/">
        <button>Go Back</button>
      </Link>
    </div>
    <p>This is the About page</p>
  </div>
)

export default ButtonLink
