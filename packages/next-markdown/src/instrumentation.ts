import React from 'react'

import {
  MARKDOWN_COMPONENT_MARKER_TAG,
  MARKDOWN_INTERACTIVE_ATTR,
  MARKDOWN_INTERNAL_COMPONENT_BEHAVIOR_OMIT,
  MARKDOWN_INTERNAL_COMPONENT_BEHAVIOR_PASSTHROUGH,
  MARKDOWN_SEGMENT_MARKER_TAG,
  getMarkdownInternalComponentBehavior,
} from './constants'

const REACT_CLIENT_REFERENCE_TYPE = Symbol.for('react.client.reference')
const REACT_FORWARD_REF_TYPE = Symbol.for('react.forward_ref')
const REACT_MEMO_TYPE = Symbol.for('react.memo')
const NO_COMPONENT_REWRITE = Symbol('NO_COMPONENT_REWRITE')

type Thenable<T> = PromiseLike<T>

type SegmentMarkerInfo = {
  id: string
  registerProps?: (props: any) => void
}

type MarkReactNodeOptions = {
  segmentRegistry?: Map<any, SegmentMarkerInfo>
}

export function markReactNode(
  node: React.ReactNode,
  options: MarkReactNodeOptions = {}
): React.ReactNode {
  if (node == null || typeof node === 'boolean') {
    return node
  }

  if (Array.isArray(node)) {
    return node.map((value, index) => {
      const marked = markReactNode(value, options)
      if (React.isValidElement(marked) && marked.key == null) {
        return React.cloneElement(marked, { key: index })
      }
      return marked
    })
  }

  if (isThenable<React.ReactNode>(node)) {
    return node.then((value) =>
      markReactNode(value, options)
    ) as React.ReactNode
  }

  if (
    typeof node === 'string' ||
    typeof node === 'number' ||
    typeof node === 'bigint'
  ) {
    return node
  }

  if (!React.isValidElement(node)) {
    return node
  }

  const element = node as React.ReactElement<any, any>
  const type = element.type as any
  const props = element.props as Record<string, any>

  if (type === React.Fragment) {
    return React.createElement(
      React.Fragment,
      null,
      markReactNode(props.children, options)
    )
  }

  if (typeof type === 'string') {
    const interactive = hasInteractiveProps(props)
    const nextChildren = markReactNode(props.children, options)

    if (!interactive) {
      return React.cloneElement(element, undefined, nextChildren)
    }

    return React.cloneElement(
      element,
      { [MARKDOWN_INTERACTIVE_ATTR]: 'true' } as any,
      nextChildren
    )
  }

  const segmentInfo = options.segmentRegistry?.get(type)
  const componentName = extractComponentName(type)
  const rewrittenComponent = rewriteInternalComponent(props, (value) =>
    markReactNode(value, options)
  )

  if (rewrittenComponent !== NO_COMPONENT_REWRITE) {
    return rewrittenComponent
  }

  if (isClientReferenceType(type)) {
    return applyMarkerToNode(
      React.cloneElement(
        element,
        undefined,
        markReactNode(props.children, options)
      ),
      segmentInfo,
      componentName
    )
  }

  if (typeof type === 'function' && !isClassComponent(type)) {
    const Wrapped = function WrappedMarkdownComponent(componentProps: any) {
      segmentInfo?.registerProps?.(componentProps)

      const rendered = (type as any)({
        ...componentProps,
        children: markReactNode(componentProps.children, options),
      })

      const applyMarker = (value: React.ReactNode) =>
        applyMarkerToNode(
          markReactNode(value, options),
          segmentInfo,
          componentName
        )

      return isThenable<React.ReactNode>(rendered)
        ? rendered.then(applyMarker)
        : applyMarker(rendered)
    }

    Wrapped.displayName = `NextMarkdown(${componentName || 'Component'})`

    return React.createElement(Wrapped as any, props)
  }

  const objectType = type as any

  if (
    objectType &&
    typeof objectType === 'object' &&
    objectType.$$typeof === REACT_FORWARD_REF_TYPE
  ) {
    const Wrapped = React.forwardRef<any, any>(
      function WrappedMarkdownForwardRef(forwardedProps: any, ref: any) {
        segmentInfo?.registerProps?.(forwardedProps)

        const rendered = objectType.render(
          {
            ...forwardedProps,
            children: markReactNode(forwardedProps.children, options),
          },
          ref
        )

        const applyMarker = (value: React.ReactNode) =>
          applyMarkerToNode(
            markReactNode(value, options),
            segmentInfo,
            componentName
          )

        return isThenable<React.ReactNode>(rendered)
          ? rendered.then(applyMarker)
          : applyMarker(rendered)
      } as any
    )

    Wrapped.displayName = `NextMarkdown(${componentName || 'ForwardRef'})`

    return React.createElement(Wrapped as any, props)
  }

  if (
    objectType &&
    typeof objectType === 'object' &&
    objectType.$$typeof === REACT_MEMO_TYPE
  ) {
    const MemoWrapped = React.memo(function WrappedMarkdownMemo(
      memoProps: any
    ) {
      segmentInfo?.registerProps?.(memoProps)
      return markReactNode(
        React.createElement(objectType.type as any, memoProps),
        options
      ) as any
    }, objectType.compare)

    MemoWrapped.displayName = `NextMarkdown(${componentName || 'Memo'})`

    return React.createElement(MemoWrapped as any, props)
  }

  if (segmentInfo) {
    segmentInfo.registerProps?.(props)
    return createMarker(
      MARKDOWN_SEGMENT_MARKER_TAG,
      { 'data-segment-id': segmentInfo.id },
      React.createElement(type as any, {
        ...props,
        children: markReactNode(props.children, options),
      })
    )
  }

  if (!componentName) {
    return React.createElement(type as any, {
      ...props,
      children: markReactNode(props.children, options),
    })
  }

  return createMarker(
    MARKDOWN_COMPONENT_MARKER_TAG,
    { 'data-name': componentName },
    React.createElement(type as any, {
      ...props,
      children: markReactNode(props.children, options),
    })
  )
}

export async function resolveReactNodeForMarkdown(
  node: React.ReactNode
): Promise<React.ReactNode> {
  if (
    node == null ||
    typeof node === 'boolean' ||
    typeof node === 'string' ||
    typeof node === 'number' ||
    typeof node === 'bigint'
  ) {
    return node
  }

  if (Array.isArray(node)) {
    const children = await Promise.all(
      node.map((value) => resolveReactNodeForMarkdown(value))
    )

    return children.map((value, index) => {
      if (React.isValidElement(value) && value.key == null) {
        return React.cloneElement(value, { key: index })
      }

      return value
    })
  }

  if (isThenable<React.ReactNode>(node)) {
    return resolveReactNodeForMarkdown(await node)
  }

  if (!React.isValidElement(node)) {
    return node
  }

  const element = node as React.ReactElement<any, any>
  const props = element.props as Record<string, any>
  const children = await resolveReactNodeForMarkdown(props.children)

  if (element.type === React.Fragment) {
    return React.createElement(React.Fragment, { key: element.key }, children)
  }

  return React.cloneElement(element, undefined, children)
}

export function sanitizeReactNodeForMarkdown(
  node: React.ReactNode
): React.ReactNode {
  if (
    node == null ||
    typeof node === 'boolean' ||
    typeof node === 'string' ||
    typeof node === 'number' ||
    typeof node === 'bigint'
  ) {
    return node
  }

  if (Array.isArray(node)) {
    return node.map((value, index) => {
      const sanitized = sanitizeReactNodeForMarkdown(value)

      if (React.isValidElement(sanitized) && sanitized.key == null) {
        return React.cloneElement(sanitized, { key: index })
      }

      return sanitized
    })
  }

  if (isThenable<React.ReactNode>(node)) {
    return node.then((value) =>
      sanitizeReactNodeForMarkdown(value)
    ) as React.ReactNode
  }

  if (!React.isValidElement(node)) {
    return node
  }

  const element = node as React.ReactElement<any, any>
  const props = element.props as Record<string, any>
  const rewrittenComponent = rewriteInternalComponent(
    props,
    sanitizeReactNodeForMarkdown
  )

  if (rewrittenComponent !== NO_COMPONENT_REWRITE) {
    return rewrittenComponent
  }

  if (element.type === React.Fragment) {
    return React.createElement(
      React.Fragment,
      null,
      sanitizeReactNodeForMarkdown(props.children)
    )
  }

  return React.cloneElement(
    element,
    undefined,
    sanitizeReactNodeForMarkdown(props.children)
  )
}

function rewriteInternalComponent(
  props: Record<string, any>,
  recurse: (node: React.ReactNode) => React.ReactNode
): React.ReactNode | typeof NO_COMPONENT_REWRITE {
  const behavior = getMarkdownInternalComponentBehavior(props)

  if (behavior === MARKDOWN_INTERNAL_COMPONENT_BEHAVIOR_PASSTHROUGH) {
    return recurse(props.children)
  }

  if (behavior === MARKDOWN_INTERNAL_COMPONENT_BEHAVIOR_OMIT) {
    return null
  }

  return NO_COMPONENT_REWRITE
}

function isThenable<T>(value: unknown): value is Thenable<T> {
  return !!value && typeof value === 'object' && 'then' in value
}

function extractComponentName(type: any): string | null {
  if (!type || typeof type === 'string') {
    return null
  }

  try {
    if (typeof type === 'function') {
      return (
        type.displayName ||
        type.name ||
        getClientReferenceName(type.$$id) ||
        null
      )
    }

    if (typeof type === 'object') {
      if (type.$$typeof === REACT_CLIENT_REFERENCE_TYPE) {
        return (
          type.displayName ||
          type.name ||
          getClientReferenceName(type.$$id) ||
          null
        )
      }

      if (type.$$typeof === REACT_MEMO_TYPE) {
        return (
          type.displayName ||
          extractComponentName(type.type) ||
          type.type?.name ||
          null
        )
      }

      if (type.$$typeof === REACT_FORWARD_REF_TYPE) {
        return (
          type.displayName ||
          type.render?.displayName ||
          type.render?.name ||
          null
        )
      }
    }
  } catch {}

  return null
}

function isClassComponent(type: any): boolean {
  try {
    return !!(type && type.prototype && type.prototype.isReactComponent)
  } catch {
    return false
  }
}

function getClientReferenceName(id: unknown): string | null {
  if (typeof id !== 'string') {
    return null
  }

  const exportName = id.split('#').pop()
  return exportName && exportName !== 'default' ? exportName : null
}

function isClientReferenceType(type: any): boolean {
  try {
    return (
      !!type &&
      (typeof type === 'function' || typeof type === 'object') &&
      type.$$typeof === REACT_CLIENT_REFERENCE_TYPE
    )
  } catch {
    return false
  }
}

function hasInteractiveProps(props: Record<string, unknown>): boolean {
  return Object.keys(props).some((key) => {
    if (key === 'children' || key === MARKDOWN_INTERACTIVE_ATTR) {
      return false
    }

    return /^on[A-Z]/.test(key) && typeof props[key] === 'function'
  })
}

function createMarker(
  tagName: string,
  props: Record<string, string>,
  child: React.ReactNode
): React.ReactElement {
  return React.createElement(tagName, props, child)
}

function applyMarkerToNode(
  node: React.ReactNode,
  segmentInfo: SegmentMarkerInfo | undefined,
  componentName: string | null
): React.ReactNode {
  if (segmentInfo) {
    return createMarker(
      MARKDOWN_SEGMENT_MARKER_TAG,
      { 'data-segment-id': segmentInfo.id },
      node
    )
  }

  if (componentName) {
    return createMarker(
      MARKDOWN_COMPONENT_MARKER_TAG,
      { 'data-name': componentName },
      node
    )
  }

  return node
}
