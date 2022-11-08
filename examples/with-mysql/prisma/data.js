const { Prisma } = require('@prisma/client')

const categories = [
  {
    name: 'Hats',
    description: 'Things you can wear on your head',
  },
  {
    name: 'Socks',
    description: 'Things you can wear on your feet',
  },
  {
    name: 'Shirts',
    description: 'Things you wear on the top half of your body',
  },
]

const products = [
  {
    name: 'Cool helmet.',
    description: 'A nice helmet to wear on your head',
    price: new Prisma.Decimal(19.95),
    image: '/images/helmet.jpg',
    category_id: 1,
  },
  {
    name: 'Grey T-Shirt',
    description: 'A nice shirt that you can wear on your body',
    price: new Prisma.Decimal(22.95),
    image: '/images/shirt.jpg',
    category_id: 3,
  },
  {
    name: 'Socks',
    description: 'Cool socks that you can wear on your feet',
    price: new Prisma.Decimal(12.95),
    image: '/images/socks.jpg',
    category_id: 2,
  },
  {
    name: 'Sweatshirt',
    description: 'Cool sweatshirt that you can wear on your body',
    price: new Prisma.Decimal(12.95),
    image: '/images/sweatshirt.jpg',
    category_id: 3,
  },
]

module.exports = {
  products,
  categories,
}
