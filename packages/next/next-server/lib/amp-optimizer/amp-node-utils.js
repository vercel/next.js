/**
 * Copyright 2020 The AMP HTML Authors. All Rights Reserved.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *      http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS-IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */


const { Element, DataNode } = require('domhandler')
const domUtils = require('domutils')
const { removeElement, append, prepend } = require('domutils')

/**
 * Depth-first walk through the DOM tree.
 * @param {Node} node
 */
const nextNode = function (node) {
  // Walk downwards if there are children
  const firstChild = node.firstChild
  if (firstChild) {
    return firstChild
  }
  // Return the direct sibling or walk upwards until we find a node with sibling
  let tmp = node
  while (tmp) {
    const next = tmp.nextSibling
    if (next) {
      return next
    }
    // Walk upwards
    tmp = tmp.parent
  }
  // We are done
  return null
}

/**
 * Remove node from DOM
 *
 * @param {Node} node
 */
const remove = function (node) {
  removeElement(node)
}

/**
 * Appends a node to the given parent
 *
 * @param {Node} parent
 * @param {Node} node
 */
const appendChild = function (parent, node) {
  if (!node) {
    return
  }
  domUtils.appendChild(parent, node)
}

/**
 * Inserts a Node before the reference node. If referenceNode is null, inserts the node as
 * the first child.
 *
 * @param {Node} newNode the node to be inserted.
 * @param {Node} referenceNode the reference node, where the new node will be added before.
 */
const insertBefore = function (parent, newNode, referenceNode) {
  if (referenceNode) {
    prepend(referenceNode, newNode)
    return
  }
  // if referenceNode.nextSibling is null, referenceNode is the last child. newNode is inserted
  // as the last element.
  appendChild(parent, newNode)
}

/**
 * Inserts a Node after the reference node. If referenceNode is null, inserts the node as
 * the first child.
 *
 * @param {Node} newNode the node to be inserted.
 * @param {Node} referenceNode the reference node, where the new node will be added after.
 */
const insertAfter = function (parent, newNode, referenceNode) {
  if (referenceNode) {
    append(referenceNode, newNode)
    return
  }
  // if referenceNode.nextSibling is null, referenceNode is the last child. newNode is inserted
  // as the last element.
  appendChild(parent, newNode)
}

/**
 * Appends all nodes to the given parent
 *
 * @param {Node} parent
 * @param {Array<Node>} node
 */
const appendAll = function (node, nodes) {
  if (!nodes) {
    return
  }
  for (let i = 0, len = nodes.length; i < len; i++) {
    appendChild(node, nodes[i])
  }
}

/**
 * Returns the first child with the given tag name
 *
 * @param {Node} node
 * @param {String} tagName
 */
const firstChildByTag = function (node, tagName) {
  if (!node || !node.children) {
    return null
  }
  return node.children.find(
    (child) => child.tagName && child.tagName === tagName
  )
}

//
/**
 * Returns true if an attribute with the given name exists
 * @param {Node} node
 * @param {String} attributeName
 */
const hasAttribute = function (node, attribute) {
  if (!node.attribs) return false
  return attribute in node.attribs
}

/**
 * Move a node from one parent to another
 * @param {Node} nodeToMove
 * @param {Node} newParent
 */
const move = function (nodeToMove, newParent) {
  remove(nodeToMove)
  appendChild(newParent, nodeToMove)
}

/**
 * Creates a new element
 *
 * @param {string} tagName
 * @param {obj} [attribs={}]
 * @returns {Node} new node
 */
const createElement = (tagName, attribs) => {
  return new Element(tagName, attribs)
}

/**
 * Inserts text
 *
 * @param {Node} node
 * @param {string} the text
 */
const insertText = (node, text) => {
  const dataNode = new DataNode('text', text)
  appendChild(node, dataNode)
}

/**
 * Creates a new doctype
 */
const createDocType = () => {
  const result = new DataNode('directive', '!doctype html')
  return result
}

module.exports = {
  appendChild,
  appendAll,
  insertAfter,
  nextNode,
  remove,
  createDocType,
  createElement,
  insertText,
  insertBefore,
  hasAttribute,
  firstChildByTag,
  move,
}
