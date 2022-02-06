# Missing `loader` Prop on `next/image`

#### Why This Error Occurred

When using the `next/image` component with [`loader="custom"`](https://nextjs.org/docs/basic-features/image-optimization#loader) in `next.config.js`, you must provide the [`loader`](https://nextjs.org/docs/api-reference/next/image#loader) prop to the component with your custom implementation.

#### Possible Ways to Fix It

- Add the [`loader`](https://nextjs.org/docs/api-reference/next/image#loader) prop to all usages of the `next/image` component.
- Change the [`loader`](https://nextjs.org/docs/basic-features/image-optimization#loader) configuration in `next.config.js`.

### Useful Links

- [Image Optimization Documentation](https://nextjs.org/docs/basic-features/image-optimization)
- [`next/image` Documentation](https://nextjs.org/docs/api-reference/next/image)
