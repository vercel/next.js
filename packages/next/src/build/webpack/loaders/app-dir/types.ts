// TODO-APP: check if this can be narrowed.
export type ComponentModule = () => any
export type ModuleReference = [
  componentModule: ComponentModule,
  filePath: string
]

export type CollectedMetadata = {
  icon: ComponentModule[]
  apple: ComponentModule[]
}
