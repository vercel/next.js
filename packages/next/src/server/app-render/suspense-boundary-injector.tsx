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
      }
    };

    // Build tree from boundaries and dynamic accesses
    function buildTree(boundaries, dynamicAccesses) {
      var root = { name: 'Root', children: {}, boundaries: [], apis: [] };

      // Add boundaries to tree
      boundaries.forEach(function(b) {
        if (!b.frames.length) return;
        // Reverse frames: from root to leaf
        var path = b.frames.slice().reverse();
        var node = root;
        path.forEach(function(frame) {
          var name = frame.componentName;
          if (!node.children[name]) {
            node.children[name] = { name: name, children: {}, boundaries: [], apis: [], frame: frame };
          }
          node = node.children[name];
        });
        node.boundaries.push(b);
      });

      // Add dynamic APIs to tree
      dynamicAccesses.forEach(function(api) {
        if (!api.frames.length) return;
        var path = api.frames.slice().reverse();
        var node = root;
        path.forEach(function(frame) {
          var name = frame.componentName;
          if (!node.children[name]) {
            node.children[name] = { name: name, children: {}, boundaries: [], apis: [], frame: frame };
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
      var isExpanded = sp.expanded[path] !== false; // Default expanded
      var indent = depth * 16;

      var html = '';

      if (depth > 0) {
        var hasSuspense = node.boundaries.length > 0;
        var hasApis = node.apis.length > 0;

        html += '<div style="border-bottom:1px solid #f5f5f5;">';
        html += '<div onclick="window.__sp.toggle(\\'' + path + '\\')" style="padding:8px 12px 8px ' + (12 + indent) + 'px;cursor:pointer;display:flex;align-items:center;gap:6px;">';

        if (hasChildren) {
          html += '<span style="color:#999;font-size:9px;width:10px;">' + (isExpanded ? '▼' : '▶') + '</span>';
        } else {
          html += '<span style="width:10px;"></span>';
        }

        html += '<span style="color:#1a1a1a;">' + node.name + '</span>';

        if (hasSuspense) {
          html += '<span style="background:#e8e8e8;color:#666;padding:1px 6px;border-radius:3px;font-size:10px;">suspense</span>';
        }
        if (hasApis) {
          var apiNames = [];
          node.apis.forEach(function(a) { if (apiNames.indexOf(a.expression) === -1) apiNames.push(a.expression); });
          html += '<span style="color:#888;font-size:11px;margin-left:auto;">' + apiNames.join(', ') + '</span>';
        }

        html += '</div></div>';
      }

      if (isExpanded && hasChildren) {
        childKeys.forEach(function(key) {
          html += renderNode(node.children[key], depth + 1, path + '/' + key);
        });
      }

      return html;
    }

    function render() {
      var boundaries = data.boundaries || [];
      var dynamicAccesses = data.dynamicAccesses || [];
      var sp = window.__sp;

      if (sp.isOpen) {
        var tree = buildTree(boundaries, dynamicAccesses);
        var treeHtml = '';
        Object.keys(tree.children).forEach(function(key) {
          treeHtml += renderNode(tree.children[key], 1, key);
        });

        container.innerHTML = '<div style="position:fixed;bottom:20px;right:20px;z-index:99999;font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,sans-serif;font-size:13px;">' +
          '<div style="background:#fff;color:#1a1a1a;border:1px solid #e0e0e0;border-radius:8px;width:360px;max-height:450px;overflow:hidden;display:flex;flex-direction:column;box-shadow:0 4px 12px rgba(0,0,0,0.1);">' +
            '<div style="padding:12px 16px;border-bottom:1px solid #e0e0e0;display:flex;justify-content:space-between;align-items:center;">' +
              '<span style="font-weight:600;color:#1a1a1a;">Component Tree</span>' +
              '<button onclick="window.__sp.close()" style="background:none;border:none;color:#666;cursor:pointer;font-size:18px;line-height:1;padding:0 4px;">×</button>' +
            '</div>' +
            '<div style="overflow:auto;flex:1;">' +
              (treeHtml || '<div style="padding:16px;color:#888;">No boundaries detected</div>') +
            '</div>' +
          '</div>' +
        '</div>';
      } else {
        var hasDynamic = dynamicAccesses.length > 0;
        container.innerHTML = '<div style="position:fixed;bottom:20px;right:20px;z-index:99999;font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,sans-serif;font-size:13px;">' +
          '<button onclick="window.__sp.open()" style="background:#fff;color:#1a1a1a;border:1px solid #e0e0e0;border-radius:6px;padding:8px 14px;cursor:pointer;display:flex;align-items:center;gap:8px;box-shadow:0 2px 8px rgba(0,0,0,0.08);">' +
            '<span>⏳ ' + boundaries.length + '</span>' +
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
