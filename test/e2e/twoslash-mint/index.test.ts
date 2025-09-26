import { nextTestSetup } from 'e2e-utils'

describe('twoslash', () => {
  const { next } = nextTestSetup({
    files: __dirname,
    dependencies: {
      '@mintlify/mdx': '2.0.11',
      '@shikijs/twoslash': '3.13.0',
      twoslash: '0.3.4',
    },
  })

  it('should annotate twoslash types', async () => {
    const result = JSON.parse(await next.render('/'))

    expect(result).toMatchInlineSnapshot(`
     {
       "compiledSource": ""use strict";
     const {jsx: _jsx, jsxs: _jsxs} = arguments[0];
     const {useMDXComponents: _provideComponents} = arguments[0];
     function _createMdxContent(props) {
       const _components = {
         code: "code",
         div: "div",
         p: "p",
         pre: "pre",
         span: "span",
         ..._provideComponents(),
         ...props.components
       }, {Popup, PopupContent, PopupTrigger} = _components;
       if (!Popup) _missingMdxReference("Popup", true);
       if (!PopupContent) _missingMdxReference("PopupContent", true);
       if (!PopupTrigger) _missingMdxReference("PopupTrigger", true);
       return _jsx(_components.pre, {
         className: "shiki shiki-themes github-light-default dark-plus twoslash lsp",
         style: {
           backgroundColor: "transparent",
           "--shiki-dark-bg": "transparent",
           color: "#1f2328",
           "--shiki-dark": "#D4D4D4"
         },
         language: "typescript",
         children: _jsxs(_components.code, {
           language: "typescript",
           children: [_jsxs(_components.span, {
             className: "line",
             children: [_jsx(_components.span, {
               style: {
                 color: "#CF222E",
                 "--shiki-dark": "#569CD6"
               },
               children: "type"
             }), _jsx(_components.span, {
               style: {
                 color: "#953800",
                 "--shiki-dark": "#4EC9B0"
               },
               children: " "
             }), _jsx(_components.span, {
               style: {
                 color: "#953800",
                 "--shiki-dark": "#4EC9B0"
               },
               children: _jsxs(Popup, {
                 className: "twoslash-hover",
                 children: [_jsx(PopupContent, {
                   className: "twoslash-popup-container",
                   children: _jsx(_components.span, {
                     className: "mint-twoslash-popover-pre",
                     children: _jsxs(_components.code, {
                       className: "twoslash-popup-code shiki",
                       children: [_jsx(_components.span, {
                         style: {
                           color: "#CF222E",
                           "--shiki-dark": "#569CD6"
                         },
                         children: "type"
                       }), _jsx(_components.span, {
                         style: {
                           color: "#953800",
                           "--shiki-dark": "#4EC9B0"
                         },
                         children: " X"
                       }), _jsx(_components.span, {
                         style: {
                           color: "#CF222E",
                           "--shiki-dark": "#D4D4D4"
                         },
                         children: " ="
                       }), _jsx(_components.span, {
                         style: {
                           color: "#953800",
                           "--shiki-dark": "#4EC9B0"
                         },
                         children: " Promise"
                       }), _jsx(_components.span, {
                         style: {
                           color: "#1F2328",
                           "--shiki-dark": "#D4D4D4"
                         },
                         children: "<"
                       }), _jsx(_components.span, {
                         style: {
                           color: "#0550AE",
                           "--shiki-dark": "#4EC9B0"
                         },
                         children: "number"
                       }), _jsx(_components.span, {
                         style: {
                           color: "#1F2328",
                           "--shiki-dark": "#D4D4D4"
                         },
                         children: ">"
                       })]
                     })
                   })
                 }), _jsx(PopupTrigger, {
                   children: "X"
                 })]
               })
             }), _jsx(_components.span, {
               style: {
                 color: "#CF222E",
                 "--shiki-dark": "#D4D4D4"
               },
               children: " ="
             }), _jsx(_components.span, {
               style: {
                 color: "#953800",
                 "--shiki-dark": "#4EC9B0"
               },
               children: " "
             }), _jsx(_components.span, {
               style: {
                 color: "#953800",
                 "--shiki-dark": "#4EC9B0"
               },
               children: _jsxs(Popup, {
                 className: "twoslash-hover",
                 children: [_jsxs(PopupContent, {
                   className: "twoslash-popup-container",
                   children: [_jsx(_components.span, {
                     className: "mint-twoslash-popover-pre",
                     children: _jsxs(_components.code, {
                       className: "twoslash-popup-code shiki",
                       children: [_jsx(_components.span, {
                         style: {
                           color: "#CF222E",
                           "--shiki-dark": "#569CD6"
                         },
                         children: "interface"
                       }), _jsx(_components.span, {
                         style: {
                           color: "#953800",
                           "--shiki-dark": "#4EC9B0"
                         },
                         children: " Promise"
                       }), _jsx(_components.span, {
                         style: {
                           color: "#1F2328",
                           "--shiki-dark": "#D4D4D4"
                         },
                         children: "<"
                       }), _jsx(_components.span, {
                         style: {
                           color: "#953800",
                           "--shiki-dark": "#4EC9B0"
                         },
                         children: "T"
                       }), _jsx(_components.span, {
                         style: {
                           color: "#1F2328",
                           "--shiki-dark": "#D4D4D4"
                         },
                         children: ">"
                       })]
                     })
                   }), _jsx(_components.div, {
                     className: "prose-sm prose-gray dark:prose-dark twoslash-popup-docs",
                     children: _jsx(_components.p, {
                       children: "Represents the completion of an asynchronous operation"
                     })
                   })]
                 }), _jsx(PopupTrigger, {
                   children: "Promise"
                 })]
               })
             }), _jsx(_components.span, {
               style: {
                 color: "#1F2328",
                 "--shiki-dark": "#D4D4D4"
               },
               children: "<"
             }), _jsx(_components.span, {
               style: {
                 color: "#0550AE",
                 "--shiki-dark": "#4EC9B0"
               },
               children: "number"
             }), _jsx(_components.span, {
               style: {
                 color: "#1F2328",
                 "--shiki-dark": "#D4D4D4"
               },
               children: ">"
             })]
           }), "\\n", _jsx(_components.span, {
             className: "line"
           })]
         })
       });
     }
     function MDXContent(props = {}) {
       const {wrapper: MDXLayout} = {
         ..._provideComponents(),
         ...props.components
       };
       return MDXLayout ? _jsx(MDXLayout, {
         ...props,
         children: _jsx(_createMdxContent, {
           ...props
         })
       }) : _createMdxContent(props);
     }
     return {
       default: MDXContent
     };
     function _missingMdxReference(id, component) {
       throw new Error("Expected " + (component ? "component" : "object") + " \`" + id + "\` to be defined: you likely forgot to import, pass, or provide it.");
     }
     ",
       "frontmatter": {},
       "scope": {},
     }
    `)
  })
})
