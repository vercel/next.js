module.exports = {
  images: {
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
    breakpoints: [480, 1024, 1600],
  },
}
