# `placeholder=blur` without `blurDataURL`

#### Why This Error Occurred

You are attempting use the `next/image` component with `placeholder=blur` property but no `blurDataURL` property.

The `blurDataURL` might be missing because your using a string for `src` instead of a static import.

Or `blurDataURL` might be missing because the static import is an unsupported image format. Only jpg, png, and webp are supported at this time.

#### Possible Ways to Fix It

- Add a [`blurDataURL`](https://nextjs.org/docs/api-reference/next/image#blurdataurl) property, the contents should be a small Data URL to represent the image
- Change the [`src`](https://nextjs.org/docs/api-reference/next/image#src) property to a static import with one of the supported file types: jpg, png, or webp
- Remove the [`placeholder`](https://nextjs.org/docs/api-reference/next/image#placeholder) property, effectively no blur effect
