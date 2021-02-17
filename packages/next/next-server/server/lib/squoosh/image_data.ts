export default class ImageData {
  static from(input: ImageData): ImageData {
    return new ImageData(input.data || input._data, input.width, input.height)
  }

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
