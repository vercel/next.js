/// <reference types="./expression-builder.d.ts" />
// import { createSelectQueryBuilder, } from '../query-builder/select-query-builder.js';
// import { SelectQueryNode } from '../operation-node/select-query-node.js';
// import { parseTableExpressionOrList, parseTable, } from '../parser/table-parser.js';
// import { WithSchemaPlugin } from '../plugin/with-schema/with-schema-plugin.js';
// import { createQueryId } from '../util/query-id.js';
import { createFunctionModule } from '../query-builder/function-module.js'
// import { parseJSONReference, parseReferenceExpression, parseStringReference, } from '../parser/reference-parser.js';
// import { parseFilterList, parseFilterObject, parseValueBinaryOperation, parseValueBinaryOperationOrExpression, } from '../parser/binary-operation-parser.js';
// import { ParensNode } from '../operation-node/parens-node.js';
// import { ExpressionWrapper } from './expression-wrapper.js';
// import { OperatorNode, } from '../operation-node/operator-node.js';
// import { parseUnaryOperation } from '../parser/unary-operation-parser.js';
// import { parseSafeImmediateValue, parseValueExpression, } from '../parser/value-parser.js';
// import { NOOP_QUERY_EXECUTOR } from '../query-executor/noop-query-executor.js';
// import { CaseBuilder } from '../query-builder/case-builder.js';
// import { CaseNode } from '../operation-node/case-node.js';
// import { isReadonlyArray, isUndefined } from '../util/object-utils.js';
// import { JSONPathBuilder } from '../query-builder/json-path-builder.js';
// import { BinaryOperationNode } from '../operation-node/binary-operation-node.js';
// import { AndNode } from '../operation-node/and-node.js';
// import { TupleNode } from '../operation-node/tuple-node.js';
import { JSONPathNode } from '../operation-node/json-path-node.js'
// import { parseDataTypeExpression, } from '../parser/data-type-parser.js';
// import { CastNode } from '../operation-node/cast-node.js';
export function createExpressionBuilder(executor = NOOP_QUERY_EXECUTOR) {
  function binary(lhs, op, rhs) {
    return new ExpressionWrapper(parseValueBinaryOperation(lhs, op, rhs))
  }
  function unary(op, expr) {
    return new ExpressionWrapper(parseUnaryOperation(op, expr))
  }
  const eb = Object.assign(binary, {
    fn: undefined,
    eb: undefined,
    selectFrom(table) {
      return createSelectQueryBuilder({
        queryId: createQueryId(),
        executor,
        queryNode: SelectQueryNode.createFrom(
          parseTableExpressionOrList(table)
        ),
      })
    },
    case(reference) {
      return new CaseBuilder({
        node: CaseNode.create(
          isUndefined(reference)
            ? undefined
            : parseReferenceExpression(reference)
        ),
      })
    },
    ref(reference, op) {
      if (isUndefined(op)) {
        return new ExpressionWrapper(parseStringReference(reference))
      }
      return new JSONPathBuilder(parseJSONReference(reference, op))
    },
    jsonPath() {
      return new JSONPathBuilder(JSONPathNode.create())
    },
    table(table) {
      return new ExpressionWrapper(parseTable(table))
    },
    val(value) {
      return new ExpressionWrapper(parseValueExpression(value))
    },
    refTuple(...values) {
      return new ExpressionWrapper(
        TupleNode.create(values.map(parseReferenceExpression))
      )
    },
    tuple(...values) {
      return new ExpressionWrapper(
        TupleNode.create(values.map(parseValueExpression))
      )
    },
    lit(value) {
      return new ExpressionWrapper(parseSafeImmediateValue(value))
    },
    unary,
    not(expr) {
      return unary('not', expr)
    },
    exists(expr) {
      return unary('exists', expr)
    },
    neg(expr) {
      return unary('-', expr)
    },
    between(expr, start, end) {
      return new ExpressionWrapper(
        BinaryOperationNode.create(
          parseReferenceExpression(expr),
          OperatorNode.create('between'),
          AndNode.create(parseValueExpression(start), parseValueExpression(end))
        )
      )
    },
    betweenSymmetric(expr, start, end) {
      return new ExpressionWrapper(
        BinaryOperationNode.create(
          parseReferenceExpression(expr),
          OperatorNode.create('between symmetric'),
          AndNode.create(parseValueExpression(start), parseValueExpression(end))
        )
      )
    },
    and(exprs) {
      if (isReadonlyArray(exprs)) {
        return new ExpressionWrapper(parseFilterList(exprs, 'and'))
      }
      return new ExpressionWrapper(parseFilterObject(exprs, 'and'))
    },
    or(exprs) {
      if (isReadonlyArray(exprs)) {
        return new ExpressionWrapper(parseFilterList(exprs, 'or'))
      }
      return new ExpressionWrapper(parseFilterObject(exprs, 'or'))
    },
    parens(...args) {
      const node = parseValueBinaryOperationOrExpression(args)
      if (ParensNode.is(node)) {
        // No double wrapping.
        return new ExpressionWrapper(node)
      } else {
        return new ExpressionWrapper(ParensNode.create(node))
      }
    },
    cast(expr, dataType) {
      return new ExpressionWrapper(
        CastNode.create(
          parseReferenceExpression(expr),
          parseDataTypeExpression(dataType)
        )
      )
    },
    withSchema(schema) {
      return createExpressionBuilder(
        executor.withPluginAtFront(new WithSchemaPlugin(schema))
      )
    },
  })
  eb.fn = createFunctionModule()
  eb.eb = eb
  return eb
}
export function expressionBuilder(_) {
  return createExpressionBuilder()
}
