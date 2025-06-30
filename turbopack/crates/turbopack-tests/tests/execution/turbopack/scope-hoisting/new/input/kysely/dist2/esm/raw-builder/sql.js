/// <reference types="./sql.d.ts" />
// import { IdentifierNode } from '../operation-node/identifier-node.js';
// import { isOperationNodeSource } from '../operation-node/operation-node-source.js';
// import { RawNode } from '../operation-node/raw-node.js';
// import { ValueNode } from '../operation-node/value-node.js';
// import { parseStringReference } from '../parser/reference-parser.js';
// import { parseTable } from '../parser/table-parser.js';
import { parseValueExpression } from '../parser/value-parser.js'
// import { createQueryId } from '../util/query-id.js';
// import { createRawBuilder } from './raw-builder.js';
export const sql = Object.assign(
  (sqlFragments, ...parameters) => {
    return createRawBuilder({
      queryId: createQueryId(),
      rawNode: RawNode.create(
        sqlFragments,
        parameters?.map(parseParameter) ?? []
      ),
    })
  },
  {
    ref(columnReference) {
      return createRawBuilder({
        queryId: createQueryId(),
        rawNode: RawNode.createWithChild(parseStringReference(columnReference)),
      })
    },
    val(value) {
      return createRawBuilder({
        queryId: createQueryId(),
        rawNode: RawNode.createWithChild(parseValueExpression(value)),
      })
    },
    value(value) {
      return this.val(value)
    },
    table(tableReference) {
      return createRawBuilder({
        queryId: createQueryId(),
        rawNode: RawNode.createWithChild(parseTable(tableReference)),
      })
    },
    id(...ids) {
      const fragments = new Array(ids.length + 1).fill('.')
      fragments[0] = ''
      fragments[fragments.length - 1] = ''
      return createRawBuilder({
        queryId: createQueryId(),
        rawNode: RawNode.create(fragments, ids.map(IdentifierNode.create)),
      })
    },
    lit(value) {
      return createRawBuilder({
        queryId: createQueryId(),
        rawNode: RawNode.createWithChild(ValueNode.createImmediate(value)),
      })
    },
    literal(value) {
      return this.lit(value)
    },
    raw(sql) {
      return createRawBuilder({
        queryId: createQueryId(),
        rawNode: RawNode.createWithSql(sql),
      })
    },
    join(array, separator = sql`, `) {
      const nodes = new Array(Math.max(2 * array.length - 1, 0))
      const sep = separator.toOperationNode()
      for (let i = 0; i < array.length; ++i) {
        nodes[2 * i] = parseParameter(array[i])
        if (i !== array.length - 1) {
          nodes[2 * i + 1] = sep
        }
      }
      return createRawBuilder({
        queryId: createQueryId(),
        rawNode: RawNode.createWithChildren(nodes),
      })
    },
  }
)
function parseParameter(param) {
  if (isOperationNodeSource(param)) {
    return param.toOperationNode()
  }
  return parseValueExpression(param)
}
