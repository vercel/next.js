import Product from './product'

export default function Products({ products }) {
  return (
    <section>
      <div className="grid grid-cols-p-1 md:grid-cols-2 lg:grid-cols-3 justify-center md:col-gap-6 lg:col-gap-12 row-gap-20 md:row-gap-32 my-32">
        {products.edges.map(({ node }) => (
          <Product key={node.id} product={node} />
        ))}
      </div>
    </section>
  )
}
