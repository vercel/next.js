// Client-side dynamic route fallback for static export
// This script runs in 404.html to patch shell files with actual route params

;(function () {
  // Prevent infinite loop - only run once per page
  if (window.__shellPatched) return
  window.__shellPatched = true

  var buildId = window.__BUILD_ID__
  if (!buildId) {
    console.error('[404.html] BUILD_ID not found')
    showNotFound()
    return
  }

  // Timeout handling (10 seconds)
  var timeoutId = setTimeout(function () {
    console.error('[404.html] Timeout loading page')
    showError('Request timed out. Please try again.')
  }, 10000)

  // Clear timeout helper
  function clearLoadTimeout() {
    if (timeoutId) {
      clearTimeout(timeoutId)
      timeoutId = null
    }
  }

  // Load manifest and redirect to appropriate shell HTML
  var manifestUrl =
    '/_next/static/' + buildId + '/_clientDynamicRoutesManifest.json'

  fetch(manifestUrl)
    .then(function (res) {
      return res.json()
    })
    .then(function (manifest) {
      console.log('[404.html] Manifest loaded:', manifest)
      var pathname = window.location.pathname
      console.log('[404.html] Original pathname:', pathname)

      // Remove trailing slash for matching
      if (pathname.endsWith('/') && pathname !== '/') {
        pathname = pathname.slice(0, -1)
      }
      console.log('[404.html] Normalized pathname:', pathname)

      // Try to match against client dynamic route patterns
      for (var i = 0; i < manifest.routes.length; i++) {
        var route = manifest.routes[i]
        var pathSegments = pathname.split('/').filter(Boolean)
        var routeSegments = route.segments

        // Check if we have a catch-all segment
        var hasCatchAll = false
        for (var k = 0; k < routeSegments.length; k++) {
          if (routeSegments[k].type === 'dynamic' && routeSegments[k].catchAll) {
            hasCatchAll = true
            break
          }
        }

        if (hasCatchAll) {
          // For catch-all routes, need at least as many path segments as non-catch-all segments
          var minSegments = 0
          for (var k = 0; k < routeSegments.length; k++) {
            if (
              !(routeSegments[k].type === 'dynamic' && routeSegments[k].catchAll)
            ) {
              minSegments++
            }
          }
          if (pathSegments.length < minSegments) continue
        } else {
          // For non-catch-all routes, exact length match is required
          if (pathSegments.length !== routeSegments.length) continue
        }

        var matches = true
        var routeIdx = 0
        for (
          var j = 0;
          j < pathSegments.length && routeIdx < routeSegments.length;
          j++
        ) {
          var routeSeg = routeSegments[routeIdx]
          if (
            routeSeg.type === 'static' &&
            pathSegments[j] !== routeSeg.value
          ) {
            matches = false
            break
          }
          if (
            routeSeg.type === 'static' ||
            (routeSeg.type === 'dynamic' && !routeSeg.catchAll)
          ) {
            routeIdx++
          } else if (routeSeg.type === 'dynamic' && routeSeg.catchAll) {
            routeIdx++
            break // Catch-all consumes the rest
          }
        }

        if (matches && routeIdx === routeSegments.length) {
          // Found a match! Extract actual params from URL
          console.log('[404.html] Route matched! Pattern:', route.pattern)
          var actualParams = {}
          routeIdx = 0
          for (
            var j = 0;
            j < pathSegments.length && routeIdx < routeSegments.length;
            j++
          ) {
            var routeSeg = routeSegments[routeIdx]
            if (routeSeg.type === 'dynamic') {
              if (routeSeg.catchAll) {
                // Collect remaining segments as array
                var remaining = []
                for (var m = j; m < pathSegments.length; m++) {
                  remaining.push(pathSegments[m])
                }
                actualParams[routeSeg.name] = remaining
                routeIdx++
                break
              } else {
                actualParams[routeSeg.name] = pathSegments[j]
                routeIdx++
              }
            } else {
              routeIdx++
            }
          }
          console.log('[404.html] Extracted params:', actualParams)

          // Fetch shell HTML and patch ONLY RSC data, NOT the HTML body
          var shellPath = route.pattern.replace(/\[([^\]]+)\]/g, '__shell__')
          console.log('[404.html] Shell path:', shellPath)

          // Try without trailing slash first, then with trailing slash
          var fetchShell = function (url) {
            return fetch(url).then(function (res) {
              if (!res.ok) throw new Error('Not found')
              return res.text()
            })
          }

          fetchShell(shellPath + '.html')
            .catch(function () {
              return fetchShell(shellPath)
            })
            .catch(function () {
              return fetchShell(shellPath + '/')
            })
            .catch(function () {
              return fetchShell(shellPath + '/index.html')
            })
            .then(function (html) {
              console.log('[404.html] Shell HTML loaded, length:', html.length)

              var patchedHtml = html
              var paramNames = Object.keys(actualParams)

              // Patch RSC data in <script> tags
              console.log('[404.html] Patching RSC data for params:', paramNames)

              for (var paramName in actualParams) {
                var paramValue = actualParams[paramName]
                if (Array.isArray(paramValue)) {
                  paramValue = paramValue.join('/')
                }
                console.log(
                  '[404.html] Patching RSC param:',
                  paramName,
                  '=',
                  paramValue
                )

                // Patch RSC data in scripts - use param-specific regex only
                var pattern = new RegExp(
                  '\\\\?"' + paramName + '\\\\?"[,:]\\\\?"__shell__\\\\?"',
                  'g'
                )
                var matchCount = 0
                patchedHtml = patchedHtml.replace(pattern, function (match) {
                  matchCount++
                  return match.replace('__shell__', paramValue)
                })
                console.log(
                  '[404.html] Made ' +
                    matchCount +
                    ' RSC replacements for param ' +
                    paramName
                )
              }

              console.log(
                '[404.html] RSC patching complete. Shell HTML is minimal, React will render client-side.'
              )

              // Replace the entire page with patched shell HTML
              // Using document.write() ensures React initializes with the patched RSC data
              document.open()
              document.write(patchedHtml)
              document.close()

              console.log(
                '[404.html] Page replaced with patched shell HTML. React will initialize with correct params.'
              )
              clearLoadTimeout() // Success! Clear timeout
            })
            .catch(function (err) {
              // Shell HTML not found, show 404
              console.error('[404.html] Shell fetch failed:', err)
              showNotFound()
            })
          return
        }
      }

      // No match found, show regular 404
      showNotFound()
    })
    .catch(function (err) {
      // Manifest not found or error loading
      console.error('[404.html] Manifest load failed:', err)
      clearLoadTimeout()
      showError('Failed to load route manifest. Please check your connection and try again.')
    })

  function showNotFound() {
    clearLoadTimeout()
    var root = document.getElementById('__next')
    if (root) {
      root.innerHTML =
        '<h1>404 - Page Not Found</h1><p>The page you are looking for does not exist.</p>'
    }
  }

  function showError(message) {
    clearLoadTimeout()
    var root = document.getElementById('__next')
    if (root) {
      root.innerHTML =
        '<h1>Error Loading Page</h1><p>' +
        message +
        '</p><button onclick="location.reload()" style="padding: 10px 20px; margin-top: 20px; cursor: pointer;">Retry</button>'
    }
  }
})()
