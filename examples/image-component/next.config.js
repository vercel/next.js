module.exports = {
  images: {
    domains: ['assets.vercel.com'],
    formats: ['image/avif', 'image/webp'],
  },
}

//For tailwind you can just add 'unoptimized' to the Image className and you are ready to go:
<Image
          alt={author.name}
          unoptimized
          height="100px"
          width="100px"
          className="rounded-full align-middle"
          src={author.photo.url}
        />
