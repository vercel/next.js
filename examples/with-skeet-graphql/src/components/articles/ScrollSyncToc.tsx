//@ts-nocheck
import throttle from 'lodash.throttle'
import { useState, useEffect, useCallback } from 'react'
import { remark } from 'remark'
import { visit } from 'unist-util-visit'
import { toString as mdastToString } from 'mdast-util-to-string'
import GithubSlugger from 'github-slugger'

import Toc from './Toc'

const githubSlugger = new GithubSlugger()
const OFFSET_ACTIVE_ITEM = 128

type Props = {
  rawMarkdownBody: string
}

export default function ScrollSyncToc({ rawMarkdownBody }: Props) {
  const [activeItemIds, setActiveItemIds] = useState([])
  const [itemTopOffsets, setItemTopOffsets] = useState([])
  const [toc, setToc] = useState([])

  useEffect(() => {
    setToc(_getToc(rawMarkdownBody))
  }, [rawMarkdownBody])

  useEffect(() => {
    setItemTopOffsets(_getElementTopOffsetsById(toc))
  }, [toc])

  const handleScroll = useCallback(() => {
    const item = itemTopOffsets.find((current, i) => {
      const next = itemTopOffsets[i + 1]
      const currentPosition = window.scrollY
      const judgePosition = currentPosition + OFFSET_ACTIVE_ITEM
      return next
        ? judgePosition >= current.offsetTop && judgePosition < next.offsetTop
        : judgePosition >= current.offsetTop
    })

    const activeItemIds = item
      ? item.parents
        ? [item.id, ...item.parents.map((i) => i.id)]
        : [item.id]
      : []

    setActiveItemIds(activeItemIds)
  }, [itemTopOffsets])

  useEffect(() => {
    const throttledHandleScroll = throttle(handleScroll, 100)
    window.addEventListener('scroll', throttledHandleScroll)
    return () => {
      window.removeEventListener('scroll', throttledHandleScroll)
    }
  }, [handleScroll])

  return (
    <>
      <div className="sticky top-32">
        <Toc toc={toc} activeItemIds={activeItemIds} />
      </div>
    </>
  )
}

function _getToc(rawMarkdownBody: string) {
  const headings = _extractToc(rawMarkdownBody)
  return _attachParents(headings)
}

function _extractToc(rawMarkdownBody: string) {
  githubSlugger.reset()
  const result = []
  const ast = remark().parse(rawMarkdownBody)
  visit(ast, 'heading', (child) => {
    const value = child.children[0].value
    const id = githubSlugger.slug(value || mdastToString(child))
    const depth = child.depth
    result.push({
      value,
      id,
      depth,
    })
  })
  return result
}

const MIN_HEADER_DEPTH = 2
function _attachParents(headings: string[]) {
  headings.reverse()
  const result = headings.map((h, i) => {
    const lastIndex = headings.length - 1
    if (i === lastIndex) {
      return h
    }

    let currentDepth = h.depth

    for (let targetIndex = i + 1; targetIndex <= lastIndex; targetIndex++) {
      if (currentDepth === MIN_HEADER_DEPTH) {
        break
      }
      const targetH = headings[targetIndex]
      if (currentDepth > targetH.depth) {
        if (h.parents) {
          h.parents.push(targetH)
        } else {
          h.parents = [targetH]
        }
        currentDepth = targetH.depth
      }
    }

    return h
  })

  return result.reverse()
}

const _getElementTopOffsetsById = (ids) => {
  return ids
    .map(({ _value, id, parents }) => {
      const element = document.getElementById(id)
      return element
        ? {
            id,
            offsetTop: element.offsetTop,
            parents,
          }
        : null
    })
    .filter((item) => item)
}
