import Link from 'next/link'
import { useRouter } from 'next/router'
import PropTypes from 'prop-types'

import { categoryShape } from 'libs/prop-types'

const Header = ({ categories }) => {
  const router = useRouter()
  const getClassName = (slug) =>
    RegExp(`^/category/${slug}`).test(router.asPath)
      ? 'p-2 font-weight-bold text-dark'
      : 'p-2 text-muted'

  return (
    <>
      <header className="blog-header py-3">
        <div className="row flex-nowrap justify-content-between align-items-center">
          <div className="col-12 text-center">
            <Link href="/">
              <a className="blog-header-logo text-dark">Blog</a>
            </Link>
          </div>
        </div>
      </header>
      <div className="nav-scroller py-1 mb-2">
        <nav className="nav d-flex justify-content-between">
          {categories?.map((category) => (
            <Link key={category._id} href={`/category/${category.slug}`}>
              <a className={getClassName(category.slug)}>{category.name}</a>
            </Link>
          ))}
        </nav>
      </div>
    </>
  )
}

Header.propTypes = {
  categories: PropTypes.arrayOf(categoryShape),
}

export default Header
