declare module 'electron-next' {
  interface Directories {
    production: string
    development: string
  }

  export default function (
    directories: Directories | string,
    port?: number
  ): Promise<void>
}
