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
'mode strict'

module.exports = {
  isRenderDelayingExtension: function (script) {
    if (script.tagName !== 'script') {
      return false
    }
    const extension = script.attribs['custom-element']
    return (
      extension === 'amp-dynamic-css-classes' ||
      extension === 'amp-experiment' ||
      extension === 'amp-story'
    )
  },
  isCustomElement: function (node) {
    return node.tagName && node.tagName.startsWith('amp-')
  },
}
