# Sharp Missing In Production

#### Why This Error Occurred

The `next/image` component's default loader uses [`squoosh`](https://www.npmjs.com/package/@squoosh/lib) because it is quick to install and suitable for a development environment. For a production environment using `next start`, it is strongly recommended you install [`sharp`](https://www.npmjs.com/package/sharp) by running `yarn add sharp` in your project directory.

You are seeing this error because Image Optimization in production mode (`next start`) was detected.

#### Possible Ways to Fix It

- Install `sharp` by running `yarn add sharp` in your project directory and then reboot the server by running `next start` again
- If `sharp` is already installed but can't be resolved, set the `NEXT_SHARP_PATH` environment variable such as `NEXT_SHARP_PATH=/tmp/node_modules/sharp next start`

> Note: This is not necessary for Vercel deployments, since `sharp` is installed automatically for you.

### Useful Links

- [Image Optimization Documentation](https://nextjs.org/docs/basic-features/image-optimization)
