/**
 * Copyright 2017 The AMP HTML Authors. All Rights Reserved.
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


const {
  appendChild,
  appendAll,
  hasAttribute,
  firstChildByTag,
} = require('./amp-node-utils')
const { isRenderDelayingExtension } = require('./amp-is-extensions')

class HeadNodes {
  constructor() {
    this._styleAmpRuntime = null
    this._linkStyleAmpRuntime = null
    this._metaCharset = null
    this._scriptAmpEngine = null
    this._metaOther = []
    this._scriptRenderDelayingExtensions = []
    this._scriptNonRenderDelayingExtensions = []
    this._resourceHintLinks = []
    this._linkIcons = []
    this._styleAmpCustom = null
    this._linkStylesheetsBeforeAmpCustom = []
    this._others = []
    this._styleAmpBoilerplate = null
    this._noscript = null
  }

  register(nodes) {
    nodes.forEach(this._registerNode.bind(this))
  }

  uniquifyAndSortCustomElements() {
    this._scriptRenderDelayingExtensions = this._removeDuplicateCustomExtensions(
      this._scriptRenderDelayingExtensions
    )
    this._scriptNonRenderDelayingExtensions = this._removeDuplicateCustomExtensions(
      this._scriptNonRenderDelayingExtensions
    )
  }

  _removeDuplicateCustomExtensions(extensions) {
    const nodesByName = new Map()
    extensions.forEach((node) => {
      const name = this._getName(node)
      nodesByName.set(name, node)
    })
    return Array.from(nodesByName.values())
  }

  appendToHead(head) {
    appendChild(head, this._metaCharset)
    appendChild(head, this._linkStyleAmpRuntime)
    appendChild(head, this._styleAmpRuntime)
    appendAll(head, this._metaOther)
    appendChild(head, this._scriptAmpEngine)
    appendAll(head, this._scriptRenderDelayingExtensions)
    appendAll(head, this._scriptNonRenderDelayingExtensions)
    appendAll(head, this._linkIcons)
    appendAll(head, this._resourceHintLinks)
    appendAll(head, this._linkStylesheetsBeforeAmpCustom)
    appendChild(head, this._styleAmpCustom)
    appendAll(head, this._others)
    appendChild(head, this._styleAmpBoilerplate)
    appendChild(head, this._noscript)
  }

  _registerNode(node) {
    if (node.tagName === 'meta') {
      this._registerMeta(node)
    } else if (node.tagName === 'script') {
      this._registerScript(node)
    } else if (node.tagName === 'style') {
      this._registerStyle(node)
    } else if (node.tagName === 'link') {
      this._registerLink(node)
    } else if (node.tagName === 'noscript') {
      this._noscript = node
    } else if (node.tagName) {
      this._others.push(node)
    }
  }

  _registerMeta(node) {
    if (node.attribs.charset) {
      this._metaCharset = node
      return
    }
    this._metaOther.push(node)
  }

  _registerScript(node) {
    // Currently there are two amp engine tags: v0.js and
    // amp4ads-v0.js.  According to validation rules they are the
    // only script tags with a src attribute and do not have
    // attributes custom-element or custom-template. Record the
    // amp engine tag so it can be emitted first among script
    // tags.
    if (hasAttribute(node, 'src') && !this._getName(node)) {
      this._scriptAmpEngine = node
      return
    }
    if (hasAttribute(node, 'custom-element')) {
      if (isRenderDelayingExtension(node)) {
        this._scriptRenderDelayingExtensions.push(node)
        return
      }
      this._scriptNonRenderDelayingExtensions.push(node)
      return
    }
    if (hasAttribute(node, 'custom-template')) {
      this._scriptNonRenderDelayingExtensions.push(node)
      return
    }
    this._others.push(node)
  }

  _registerStyle(node) {
    if (hasAttribute(node, 'amp-runtime')) {
      this._styleAmpRuntime = node
      return
    }
    if (hasAttribute('node, amp-custom')) {
      this._styleAmpCustom = node
      return
    }
    if (
      hasAttribute(node, 'amp-boilerplate') ||
      hasAttribute(node, 'amp4ads-boilerplate')
    ) {
      this._styleAmpBoilerplate = node
      return
    }
    this._others.push(node)
  }

  _registerLink(node) {
    const rel = node.attribs.rel
    if (rel === 'stylesheet') {
      if (node.attribs.href.endsWith('/v0.css')) {
        this._linkStyleAmpRuntime = node
        return
      }
      if (!this._styleAmpCustom) {
        // We haven't seen amp-custom yet.
        this._linkStylesheetsBeforeAmpCustom.push(node)
        return
      }
    }

    if (rel === 'icon' || rel === 'shortcut icon' || rel === 'icon shortcut') {
      this._linkIcons.push(node)
      return
    }

    if (
      rel === 'preload' ||
      rel === 'prefetch' ||
      rel === 'dns-prefetch' ||
      rel === 'preconnect'
    ) {
      this._resourceHintLinks.push(node)
      return
    }

    this._others.push(node)
  }

  _getName(node) {
    return node.attribs['custom-element'] || node.attribs['custom-template']
  }
}

/**
 * ReorderHead reorders the children of <head>. Specifically, it
 * orders the <head> like so:
 * (0) <meta charset> tag
 * (1) <style amp-runtime> (inserted by ampruntimecss.go)
 * (2) remaining <meta> tags (those other than <meta charset>)
 * (3) AMP runtime .js <script> tag
 * (4) <script> tags that are render delaying
 * (5) <script> tags for remaining extensions
 * (6) <link> tag for favicons
 * (7) <link> tag for resource hints
 * (8) <link rel=stylesheet> tags before <style amp-custom>
 * (9) <style amp-custom>
 * (10) any other tags allowed in <head>
 * (11) AMP boilerplate (first style amp-boilerplate, then noscript)
 */
class ReorderHeadTransformer {
  transform(tree) {
    const html = firstChildByTag(tree, 'html')
    if (!html) {
      return
    }
    const head = firstChildByTag(html, 'head')
    if (!head) {
      return
    }
    const headNodes = new HeadNodes()
    headNodes.register(head.children)
    headNodes.uniquifyAndSortCustomElements()
    head.children = []
    headNodes.appendToHead(head)
  }
}

module.exports = ReorderHeadTransformer
