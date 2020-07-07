import Product from './product'

export default function Products({ products }) {
  return (
    <div className="grid grid-cols-p-1 sm:grid-cols-2 lg:grid-cols-3 justify-center sm:col-gap-6 lg:col-gap-12 row-gap-20 lg:row-gap-32">
      {products.map(({ node }) => (
        <Product key={node.id} product={node} />
      ))}
    </div>
  )
}
