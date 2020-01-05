export interface Car {
  make: string
  model: string
  engine: string
  year: number
  mileage: number
  equipment: string[]
}

export type CarList = Array<Car>
