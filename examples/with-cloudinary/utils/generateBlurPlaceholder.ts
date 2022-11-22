import { ImageProps } from './imageType'

export default async function getBase64ImageUrl(image: ImageProps) {
  const response = await fetch(
    `https://res.cloudinary.com/${process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME}/image/upload/w_100/e_blur:1000,q_auto,f_webp/${image.public_id}.${image.format}`
  )
  const buffer = await response.arrayBuffer()
  const data = Buffer.from(buffer).toString('base64')
  return `data:image/webp;base64,${data}`
}
