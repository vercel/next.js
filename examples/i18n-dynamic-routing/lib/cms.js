const db = {
  pages: [
    {
      id: '1',
      slug: { en: '/', es: '/' },
      title: { en: 'Home', es: 'Inicio' },
    },
    {
      id: '2',
      slug: { en: '/about', es: '/acerca-de' },
      title: { en: 'About', es: 'Acerca de' },
    },
    {
      id: '3',
      slug: {
        en: '/products/phone-x/specs',
        es: '/productos/phone-x/especificaciones',
      },
      title: {
        en: 'Phone X - Tech Specs',
        es: 'Phone X - Especificaciones Técnicas',
      },
    },
  ],
}

export function getPages({ locale }) {
  return db.pages.filter((page) => page.slug[locale])
}

export function getPage({ locale, slug }) {
  return db.pages.find((page) => page.slug[locale] === slug)
}
