module.exports = {
  images: {
    sizes: [480, 1024, 1600],
    hosts: {
      default: {
        path: 'https://example.com/myaccount/',
        loader: 'imgix',
      },
      secondary: {
        path: 'https://examplesecondary.com/images/',
        loader: 'cloudinary',
      },
    },
  },
}
