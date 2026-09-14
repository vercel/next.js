import Link from 'next/link'

export default () => (
  <>
    <Link href="/product" id="products-link">
      to /product
    </Link>
    <br />
    <Link href="/product/first" id="product-link">
      to /product/first
    </Link>
    <br />
    <Link href="/category" id="categories-link">
      to /category
    </Link>
    <br />
    <Link href="/category/first" id="category-link">
      to /category/first
    </Link>
    <br />
    <Link href="/category/hello/world" id="category-link-again">
      to /category/hello/world
    </Link>
    <br />
  </>
)
