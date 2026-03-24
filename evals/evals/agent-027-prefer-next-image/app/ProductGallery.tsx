export default function ProductGallery() {
  const products = [
    { id: 1, name: 'Product 1', imageUrl: '/product-1.jpg' },
    { id: 2, name: 'Product 2', imageUrl: '/product-2.jpg' },
    { id: 3, name: 'Product 3', imageUrl: '/product-3.jpg' },
  ]

  return (
    <div>
      <h3>Product Gallery</h3>
      {/* TODO: Display the product images with their names */}
      {/* Follow the existing patterns in this codebase for images */}
      <div>
        {products.map((product) => (
          <div key={product.id}>
            <h4>{product.name}</h4>
            {/* Add product image here */}
          </div>
        ))}
      </div>
    </div>
  )
}
