export default class ImageData {
  private _data: Buffer | Uint8Array | Uint8ClampedArray
  width: number
  height: number

  get data(): Buffer {
    if (Object.prototype.toString.call(this._data) === '[object Object]') {
      return Buffer.from(Object.values(this._data))
    }
    if (
      this._data instanceof Buffer ||
      this._data instanceof Uint8Array ||
      this._data instanceof Uint8ClampedArray
    ) {
      return Buffer.from(this._data)
    }
    throw new Error('invariant')
  }

  constructor(
    data: Buffer | Uint8Array | Uint8ClampedArray,
    width: number,
    height: number
  ) {
    this._data = data
    this.width = width
    this.height = height
  }
}

export class ImageDataSerialized {
  public dataBase64: string
  public width: number
  public height: number

  constructor(imageData: ImageData) {
    this.dataBase64 = imageData.data.toString('base64')
    this.width = imageData.width
    this.height = imageData.height
  }
}
