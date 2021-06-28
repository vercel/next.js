export default class ImageData {
  constructor(
    public data: Buffer | Uint8Array | Uint8ClampedArray,
    public width: number,
    public height: number
  ) {
    this.data = Uint8ClampedArray.from(data)
    this.width = width
    this.height = height
  }
}
