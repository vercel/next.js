export const getCategories = () => [
  {
    name: 'Electronics',
    slug: 'electronics',
    count: 11,
    items: [
      { name: 'Phones', slug: 'phones', count: 4 },
      { name: 'Tablets', slug: 'tablets', count: 5 },
      { name: 'Laptops', slug: 'laptops', count: 2 },
    ],
  },
  {
    name: 'Clothing',
    slug: 'clothing',
    count: 12,
    items: [
      { name: 'Tops', slug: 'tops', count: 3 },
      { name: 'Shorts', slug: 'shorts', count: 4 },
      { name: 'Shoes', slug: 'shoes', count: 5 },
    ],
  },
  {
    name: 'Books',
    slug: 'books',
    count: 10,
    items: [
      { name: 'Fiction', slug: 'fiction', count: 5 },
      { name: 'Biography', slug: 'biography', count: 2 },
      { name: 'Education', slug: 'education', count: 3 },
    ],
  },
  {
    name: 'Shoes',
    slug: 'shoes',
    count: 5,
    items: [],
    prefetch: false,
  },
]

export async function fetchCategoryBySlug(slug) {
  // Assuming it always return expected categories
  return getCategories().find((category) => category.slug === slug)
}

export async function fetchCategories() {
  return getCategories()
}

async function findSubCategory(category, subCategorySlug) {
  return category?.items.find((category) => category.slug === subCategorySlug)
}

export async function fetchSubCategory(categorySlug, subCategorySlug) {
  const category = await fetchCategoryBySlug(categorySlug)
  return findSubCategory(category, subCategorySlug)
}
