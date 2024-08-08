'use server'

export async function addToCart() {
  return new Promise((resolve, reject) => {
    setTimeout(() => {
      resolve('Add to cart')
    }, 1000)
  })
}
