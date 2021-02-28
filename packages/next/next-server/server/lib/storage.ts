import { promises } from 'fs'

export interface StorageProfiderInterface {
  readValue: (key: string) => Promise<string>
  write: (key: string, value: string | undefined) => Promise<void>
}

export class FileSystemStorageProvider implements StorageProfiderInterface {
  async readValue(key: string): Promise<string> {
    return await promises.readFile(key, 'utf8')
  }

  async write(key: string, value: string | undefined) {
    await promises.mkdir(key.substring(0, key.lastIndexOf('/')), {
      recursive: true,
    })
    await promises.writeFile(key, String(value), 'utf8')
  }
}
