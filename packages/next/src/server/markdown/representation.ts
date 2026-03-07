import { MARKDOWN_CONTENT_TYPE_HEADER } from '../../lib/constants'
import type { NegotiatedDocumentRepresentation } from '../document-representation'
import { acceptsMarkdown, appendAcceptVaryHeader } from './accepts-markdown'

export const markdownDocumentRepresentation: NegotiatedDocumentRepresentation =
  {
    id: 'markdown',
    contentType: MARKDOWN_CONTENT_TYPE_HEADER,
    outputSuffix: '.markdown',
    accepts: acceptsMarkdown,
    appendVary: appendAcceptVaryHeader,
  }
