export default function getLinks(req, res) {
  return [
    {
      href: '/b',
      as: '/a',
      value: 'a',
    },
    {
      href: '/a',
      as: '/b',
      value: 'b',
    },
  ]
}
