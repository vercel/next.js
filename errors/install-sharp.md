# Install `sharp` to Use Built-In Image Optimization

#### Why This Error Occurred

Using Next.js' built-in [Image Optimization](https://nextjs.org/docs/basic-features/image-optimization) requires [sharp](https://www.npmjs.com/package/sharp) as a dependency.

You are seeing this error because your OS was unable to [install sharp](https://sharp.pixelplumbing.com/install) properly, either using pre-built binaries or building from source.

#### Possible Ways to Fix It

Option 1: Use a different version of Node.js and try to install `sharp` again.

```bash
npm i sharp
# or
yarn add sharp
```

Option 2: If using macOS, ensure XCode Build Tools are installed and try to install `sharp` again.

For example, see [macOS Catalina instructions](https://github.com/nodejs/node-gyp/blob/66c0f0446749caa591ad841cd029b6d5b5c8da42/macOS_Catalina.md).

Option 3: Use a different OS and try to install `sharp` again.

For example, if you're using Windows, try using [WSL](https://docs.microsoft.com/en-us/windows/wsl/about) (Windows Subsystem for Linux).
