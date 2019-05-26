export class DataManager {
  data: Map<string, any>
  constructor(data?: any) {
    this.data = new Map(data)
  }

  getData() {
    return this.data
  }

  get(key: string) {
    return this.data.get(key)
  }

  set(key: string, value: any) {
    this.data.set(key, value)
  }
  overwrite(data: any) {
    this.data = new Map(data)
  }
}
