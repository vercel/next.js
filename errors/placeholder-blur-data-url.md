# `placeholder=blur` without `blurDataURL`

#### Why This Error Occurred

You are attempting use the `next/image` component with `placeholder=blur` property but no `blurDataURL` property.

#### Possible Ways to Fix It

- Add a [`blurDataURL`](https://nextjs.org/docs/api-reference/next/image#blurdataurl) property, the contents should be a small Data URL to represent the image
- Change the [`src`](https://nextjs.org/docs/api-reference/next/image#src) property to a static import with one of the supported file types: jpg, png, or webp
- Remove the [`placeholder`](https://nextjs.org/docs/api-reference/next/image#placeholder) property, effectively no blur effect
