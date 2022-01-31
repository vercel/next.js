import { stringifyRequest } from '../stringify-request'

export type NextBootloaderLoaderOptions = {
  relativeMainPath: string
}

export default function nextBootloaderLoader(this: any) {
  const { relativeMainPath }: NextBootloaderLoaderOptions = this.getOptions()
  const stringifiedMainPath = stringifyRequest(this, relativeMainPath)

  return `
        import { onBoot } from 'next/dist/client/bootloader'
        onBoot(() => import(/* webpackMode: "eager" */${stringifiedMainPath}))
    `
}
