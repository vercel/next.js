import Link from 'next/link'

export default () => (
  <>
    <Link href="/product">
      <a id="products-link">to /product</a>
    </Link>
    <br />
    <Link href="/product/first">
      <a id="product-link">to /product/first</a>
    </Link>
    <br />
    <Link href="/category">
      <a id="categories-link">to /category</a>
    </Link>
    <br />
    <Link href="/category/first">
      <a id="category-link">to /category/first</a>
    </Link>
    <br />
    <Link href="/category/hello/world">
      <a id="category-link-again">to /category/hello/world</a>
    </Link>
    <br />
  </>
)
