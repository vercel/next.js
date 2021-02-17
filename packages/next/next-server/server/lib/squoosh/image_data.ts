export default class ImageData {
  data: Buffer
  width: number
  height: number

  constructor(data: Buffer, width: number, height: number) {
    this.data = data
    this.width = width
    this.height = height
  }
}
