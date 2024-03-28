const handleMathJax = (rerun = false) => {
  if (typeof window === 'undefined') {
    return
  }

  const mathjaxScript =
    'https://cdn.jsdelivr.net/npm/mathjax@3/es5/tex-chtml.js'
  if (!window.MathJax) {
    window.MathJax = {
      tex: {
        inlineMath: [['\\(', '\\)']],
      },
    }
  }

  let mathjaxScriptTag = document.querySelector(
    `script[src="${mathjaxScript}"]`
  )
  if (!mathjaxScriptTag) {
    let script = document.createElement('script')
    script.type = 'text/javascript'
    script.src = mathjaxScript
    script.onload = function () {
      window.MathJax &&
        'mathml2chtml' in window.MathJax &&
        window.MathJax.mathml2chtml()
    }
    document.head.appendChild(script)
  } else if (rerun) {
    window.MathJax &&
      'mathml2chtml' in window.MathJax &&
      window.MathJax.mathml2chtml()
  }
}

export default handleMathJax
