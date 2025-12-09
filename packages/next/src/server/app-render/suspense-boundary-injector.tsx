import React from 'react'
import {
  getSuspenseBoundaries,
  getDynamicAccesses,
  type SuspenseBoundaryInfo,
  type DynamicAPIAccess,
} from './suspense-boundary-collector'

export interface SuspenseBoundaryData {
  boundaries: SuspenseBoundaryInfo[]
  dynamicAccesses: DynamicAPIAccess[]
  timestamp: number
}

export function getSuspenseBoundaryData(): SuspenseBoundaryData {
  return {
    boundaries: getSuspenseBoundaries(),
    dynamicAccesses: getDynamicAccesses(),
    timestamp: Date.now(),
  }
}

const panelScript = `
(function() {
  if (typeof window === 'undefined') return;

  function createPanel() {
    const script = document.getElementById('__NEXT_SUSPENSE_BOUNDARIES__');
    if (!script) return;

    let data;
    try {
      data = JSON.parse(script.textContent || '{}');
    } catch (e) {
      return;
    }

    const container = document.createElement('div');
    container.id = '__next_suspense_profiler__';
    document.body.appendChild(container);

    // Track expanded nodes by path
    window.__sp = {
      isOpen: false,
      expanded: {},
      prompts: [],
      toggle: function(path) {
        window.__sp.expanded[path] = !window.__sp.expanded[path];
        render();
      },
      open: function() {
        window.__sp.isOpen = true;
        render();
      },
      close: function() {
        window.__sp.isOpen = false;
        render();
      },
      showInsights: function(index) {
        var prompt = window.__sp.prompts[index];
        if (!prompt) return;
        navigator.clipboard.writeText(prompt).catch(function() {});
        // Show modal with prompt
        var overlay = document.createElement('div');
        overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.5);z-index:100000;display:flex;align-items:center;justify-content:center;';
        overlay.onclick = function(e) { if (e.target === overlay) document.body.removeChild(overlay); };
        var modal = document.createElement('div');
        modal.style.cssText = 'background:#fff;padding:16px;border-radius:8px;max-width:500px;max-height:80vh;overflow:auto;font-size:13px;white-space:pre-wrap;';
        modal.textContent = prompt;
        overlay.appendChild(modal);
        document.body.appendChild(overlay);
      }
    };

    // Match dynamic accesses to their enclosing suspense boundary
    // Returns: { boundaryId -> [{ expression, layersBetween, componentsBetween }] }
    function matchDynamicToBoundary(boundaries, dynamicAccesses) {
      var boundaryReasons = {};

      dynamicAccesses.forEach(function(api) {
        if (!api.frames.length) return;

        // Frames are leaf-to-root, reverse to get root-to-leaf order
        var apiFrames = api.frames.slice().reverse();
        var apiNames = apiFrames.map(function(f) { return f.componentName; });

        // Find the boundary whose path is a prefix of the api path (nearest ancestor)
        var bestMatch = null;
        var bestMatchLen = 0;
        var bestBoundaryLen = 0;

        boundaries.forEach(function(b) {
          if (!b.frames.length) return;
          var boundaryFrames = b.frames.slice().reverse();
          var boundaryNames = boundaryFrames.map(function(f) { return f.componentName; });

          // Check if boundary components are a prefix of api components
          if (boundaryNames.length > apiNames.length) return;

          var isPrefix = true;
          for (var i = 0; i < boundaryNames.length; i++) {
            if (boundaryNames[i] !== apiNames[i]) {
              isPrefix = false;
              break;
            }
          }

          if (isPrefix && boundaryNames.length > bestMatchLen) {
            bestMatch = b.id;
            bestMatchLen = boundaryNames.length;
            bestBoundaryLen = boundaryNames.length;
          }
        });

        if (bestMatch) {
          // Calculate layers between
          var layersBetween = apiNames.length - bestBoundaryLen;
          var componentsBetween = apiNames.slice(bestBoundaryLen);

          if (!boundaryReasons[bestMatch]) boundaryReasons[bestMatch] = [];

          // Check if this expression is already tracked
          var exists = false;
          for (var i = 0; i < boundaryReasons[bestMatch].length; i++) {
            if (boundaryReasons[bestMatch][i].expression === api.expression) {
              exists = true;
              break;
            }
          }
          if (!exists) {
            boundaryReasons[bestMatch].push({
              expression: api.expression,
              layersBetween: layersBetween,
              componentsBetween: componentsBetween
            });
          }
        }
      });

      return boundaryReasons;
    }

    // Generate optimization prompt for a suspense boundary with deep dynamic calls
    function generatePrompt(suspenseComponent, reasons) {
      var deepReasons = [];
      for (var i = 0; i < reasons.length; i++) {
        if (reasons[i].layersBetween > 0) deepReasons.push(reasons[i]);
      }
      if (deepReasons.length === 0) return null;

      var nl = String.fromCharCode(10);
      var prompt = 'I have a React component structure where a Suspense boundary in "' + suspenseComponent + '" wraps dynamic API calls that are nested deep in the component tree. This causes more content than necessary to show loading states.' + nl + nl;
      prompt += 'Current structure:' + nl;
      for (var j = 0; j < deepReasons.length; j++) {
        var r = deepReasons[j];
        prompt += '- ' + r.expression + '() is called ' + r.layersBetween + ' layers deep: ' + r.componentsBetween.join(' > ') + nl;
      }
      prompt += nl + 'Please help me move the Suspense boundary closer to the dynamic API calls to minimize the loading state area. Show me the refactored code.';

      var index = window.__sp.prompts.length;
      window.__sp.prompts.push(prompt);
      return index;
    }

    // Build tree from boundaries and dynamic accesses
    function buildTree(boundaries, dynamicAccesses, boundaryReasons) {
      var root = { name: 'Root', children: {}, boundaries: [], apis: [], reasons: [] };

      // Add boundaries to tree
      boundaries.forEach(function(b) {
        if (!b.frames.length) return;
        // Reverse frames: from root to leaf
        var path = b.frames.slice().reverse();
        var node = root;
        path.forEach(function(frame) {
          var name = frame.componentName;
          if (!node.children[name]) {
            node.children[name] = { name: name, children: {}, boundaries: [], apis: [], reasons: [], frame: frame };
          }
          node = node.children[name];
        });
        node.boundaries.push(b);
        // Attach reasons to this boundary node
        if (boundaryReasons[b.id]) {
          node.reasons = node.reasons.concat(boundaryReasons[b.id]);
        }
      });

      // Add dynamic APIs to tree
      dynamicAccesses.forEach(function(api) {
        if (!api.frames.length) return;
        var path = api.frames.slice().reverse();
        var node = root;
        path.forEach(function(frame) {
          var name = frame.componentName;
          if (!node.children[name]) {
            node.children[name] = { name: name, children: {}, boundaries: [], apis: [], reasons: [], frame: frame };
          }
          node = node.children[name];
        });
        node.apis.push(api);
      });

      return root;
    }

    function renderNode(node, depth, path) {
      var sp = window.__sp;
      var childKeys = Object.keys(node.children);
      var hasChildren = childKeys.length > 0;
      var hasApi = node.apis && node.apis.length > 0;
      var isExpanded = sp.expanded[path] !== false; // Default expanded
      var indent = depth * 16;

      var html = '';

      if (depth > 0) {
        var hasSuspense = node.boundaries.length > 0;
        var hasReasons = node.reasons && node.reasons.length > 0;
        var promptIndex = hasSuspense && hasReasons ? generatePrompt(node.name, node.reasons) : null;

        html += '<div style="border-bottom:1px solid #f0f0f0;">';
        html += '<div onclick="window.__sp.toggle(\\'' + path + '\\')" style="padding:6px 12px 6px ' + (12 + indent) + 'px;cursor:pointer;display:flex;align-items:center;gap:8px;">';

        if (hasChildren || hasApi) {
          html += '<span style="color:#999;font-size:9px;width:10px;">' + (isExpanded ? '▼' : '▶') + '</span>';
        } else {
          html += '<span style="width:10px;"></span>';
        }

        html += '<span style="color:#333;">' + node.name + '</span>';

        if (hasSuspense) {
          html += '<span style="background:#eee;color:#666;padding:1px 6px;border-radius:3px;font-size:10px;">suspense</span>';

          // Show ok if no deep dynamic calls, or insights button if there are
          if (promptIndex !== null) {
            html += '<button onclick="event.stopPropagation();window.__sp.showInsights(' + promptIndex + ')" style="background:#f5f5f5;border:1px solid #ddd;color:#333;padding:2px 6px;border-radius:3px;font-size:10px;cursor:pointer;margin-left:auto;">insights</button>';
          } else if (hasReasons) {
            html += '<span style="color:#666;font-size:11px;margin-left:auto;">ok</span>';
          }
        }

        html += '</div></div>';
      }

      if (isExpanded) {
        // Render dynamic API calls as children
        if (hasApi) {
          var apiIndent = (depth + 1) * 16;
          for (var i = 0; i < node.apis.length; i++) {
            var api = node.apis[i];
            html += '<div style="border-bottom:1px solid #f0f0f0;">';
            html += '<div style="padding:6px 12px 6px ' + (12 + apiIndent) + 'px;display:flex;align-items:center;gap:8px;">';
            html += '<span style="width:10px;"></span>';
            html += '<code style="background:#f5f5f5;color:#333;padding:1px 4px;border-radius:2px;font-size:11px;">' + api.expression + '</code>';
            html += '</div></div>';
          }
        }

        // Render child components
        if (hasChildren) {
          childKeys.forEach(function(key) {
            html += renderNode(node.children[key], depth + 1, path + '/' + key);
          });
        }
      }

      return html;
    }

    function render() {
      var boundaries = data.boundaries || [];
      var dynamicAccesses = data.dynamicAccesses || [];
      var sp = window.__sp;

      // Clear prompts array on each render
      sp.prompts = [];

      if (sp.isOpen) {
        var boundaryReasons = matchDynamicToBoundary(boundaries, dynamicAccesses);
        var tree = buildTree(boundaries, dynamicAccesses, boundaryReasons);
        var treeHtml = '';
        Object.keys(tree.children).forEach(function(key) {
          treeHtml += renderNode(tree.children[key], 1, key);
        });

        container.innerHTML = '<div style="position:fixed;bottom:20px;right:20px;z-index:99999;font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,sans-serif;font-size:13px;">' +
          '<div style="background:#fff;color:#1a1a1a;border:1px solid #e0e0e0;border-radius:8px;width:360px;max-height:450px;overflow:hidden;display:flex;flex-direction:column;box-shadow:0 4px 12px rgba(0,0,0,0.1);">' +
            '<div style="padding:12px 16px;border-bottom:1px solid #e0e0e0;display:flex;justify-content:space-between;align-items:center;">' +
              '<span style="font-weight:600;color:#1a1a1a;">Component Tree</span>' +
              '<button onclick="window.__sp.close()" style="background:none;border:none;color:#666;cursor:pointer;font-size:18px;line-height:1;padding:0 4px;">x</button>' +
            '</div>' +
            '<div style="overflow:auto;flex:1;">' +
              (treeHtml || '<div style="padding:16px;color:#888;">No boundaries detected</div>') +
            '</div>' +
          '</div>' +
        '</div>';
      } else {
        var hasDynamic = dynamicAccesses.length > 0;
        container.innerHTML = '<div style="position:fixed;bottom:20px;right:20px;z-index:99999;font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,sans-serif;font-size:13px;">' +
          '<button onclick="window.__sp.open()" style="background:#fff;color:#333;border:1px solid #e0e0e0;border-radius:6px;padding:8px 14px;cursor:pointer;display:flex;align-items:center;gap:8px;box-shadow:0 2px 8px rgba(0,0,0,0.08);">' +
            '<span>' + boundaries.length + ' suspense</span>' +
            (hasDynamic ? '<span style="color:#666;">' + dynamicAccesses.length + ' dynamic</span>' : '') +
          '</button>' +
        '</div>';
      }
    }

    render();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', createPanel);
  } else {
    createPanel();
  }
})();
`

export function SuspenseBoundaryScript(): React.ReactNode {
  const data = getSuspenseBoundaryData()

  return (
    <>
      <script
        id="__NEXT_SUSPENSE_BOUNDARIES__"
        type="application/json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(data),
        }}
      />
      <script
        dangerouslySetInnerHTML={{
          __html: panelScript,
        }}
      />
    </>
  )
}
