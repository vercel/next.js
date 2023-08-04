export function toCamelCase(str: string): string {
  return str
    .replace(/[-_\s](\w)/g, (_, char) => {
      return char.toUpperCase()
    })
    .replace(/^\w/, (firstChar) => {
      return firstChar.toLowerCase()
    })
}

export function toKebabCase(str: string): string {
  return str
    .replace(/([a-z])([A-Z])/g, '$1-$2')
    .replace(/\s+/g, '-')
    .replace(/_/g, '-')
    .toLowerCase()
}

export function toPascalCase(str: string): string {
  return str.replace(/[-_\s](\w)|(\w+)/g, (_, char, word) => {
    if (word) {
      return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()
    } else {
      return char.toUpperCase()
    }
  })
}
