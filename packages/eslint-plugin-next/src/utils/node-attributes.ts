// Return attributes and values of a node in a convenient way:
/* example: 
    <ExampleElement attr1="15" attr2>
    {   attr1: {
            hasValue: true,
            value: 15
        },
        attr2: {
            hasValue: false
        }
Inclusion of hasValue is in case an eslint rule cares about boolean values
explicitly assigned to attribute vs the attribute being used as a flag
*/
export default class NodeAttributes {
  attributes: Record<
    string,
    | {
        hasValue?: false
      }
    | {
        hasValue: true
        value: any
      }
  >

  constructor(ASTnode) {
    this.attributes = {}
    ASTnode.attributes.forEach((attribute) => {
      if (!attribute.type || attribute.type !== 'JSXAttribute') {
        return
      }

      if (!!attribute.value) {
        // hasValue
        const value =
          typeof attribute.value.value === 'string'
            ? attribute.value.value
            : typeof attribute.value.expression.value !== 'undefined'
            ? attribute.value.expression.value
            : attribute.value.expression.properties

        this.attributes[attribute.name.name] = {
          hasValue: true,
          value,
        }
      } else {
        this.attributes[attribute.name.name] = {
          hasValue: false,
        }
      }
    })
  }
  hasAny() {
    return !!Object.keys(this.attributes).length
  }
  has(attrName: string) {
    return !!this.attributes[attrName]
  }
  hasValue(attrName: string) {
    return !!this.attributes[attrName].hasValue
  }
  value(attrName: string) {
    const attr = this.attributes[attrName]

    if (!attr) {
      return true
    }

    if (attr.hasValue) {
      return attr.value
    }

    return undefined
  }
}
