/// <reference types="./order-by-item-builder.d.ts" />
import { CollateNode } from '../operation-node/collate-node.js'
import { OrderByItemNode } from '../operation-node/order-by-item-node.js'
import { RawNode } from '../operation-node/raw-node.js'
import { freeze } from '../util/object-utils.js'
export class OrderByItemBuilder {
  #props
  constructor(props) {
    this.#props = freeze(props)
  }
  /**
   * Adds `desc` to the `order by` item.
   *
   * See {@link asc} for the opposite.
   */
  desc() {
    return new OrderByItemBuilder({
      node: OrderByItemNode.cloneWith(this.#props.node, {
        direction: RawNode.createWithSql('desc'),
      }),
    })
  }
  /**
   * Adds `asc` to the `order by` item.
   *
   * See {@link desc} for the opposite.
   */
  asc() {
    return new OrderByItemBuilder({
      node: OrderByItemNode.cloneWith(this.#props.node, {
        direction: RawNode.createWithSql('asc'),
      }),
    })
  }
  /**
   * Adds `nulls last` to the `order by` item.
   *
   * This is only supported by some dialects like PostgreSQL and SQLite.
   *
   * See {@link nullsFirst} for the opposite.
   */
  nullsLast() {
    return new OrderByItemBuilder({
      node: OrderByItemNode.cloneWith(this.#props.node, { nulls: 'last' }),
    })
  }
  /**
   * Adds `nulls first` to the `order by` item.
   *
   * This is only supported by some dialects like PostgreSQL and SQLite.
   *
   * See {@link nullsLast} for the opposite.
   */
  nullsFirst() {
    return new OrderByItemBuilder({
      node: OrderByItemNode.cloneWith(this.#props.node, { nulls: 'first' }),
    })
  }
  /**
   * Adds `collate <collationName>` to the `order by` item.
   */
  collate(collation) {
    return new OrderByItemBuilder({
      node: OrderByItemNode.cloneWith(this.#props.node, {
        collation: CollateNode.create(collation),
      }),
    })
  }
  toOperationNode() {
    return this.#props.node
  }
}
