use swc_atoms::JsWord;
use swc_ecmascript::ast::{
  Ident, JSXAttr, JSXAttrName, JSXAttrOrSpread, JSXElementName, JSXOpeningElement,
};
use swc_ecmascript::visit::Fold;

pub fn amp_attributes() -> impl Fold {
  AmpAttributePatcher::default()
}

#[derive(Debug, Default)]
struct AmpAttributePatcher {}

impl Fold for AmpAttributePatcher {
  fn fold_jsx_opening_element(&mut self, node: JSXOpeningElement) -> JSXOpeningElement {
    let JSXOpeningElement {
      name,
      mut attrs,
      span,
      self_closing,
      type_args,
    } = node;
    let n = name.clone();

    if let JSXElementName::Ident(Ident { sym, .. }) = name {
      if sym.starts_with("amp-") {
        for i in 0..attrs.len() {
          if let JSXAttrOrSpread::JSXAttr(JSXAttr {
            name:
              JSXAttrName::Ident(Ident {
                sym,
                span: s,
                optional: o,
              }),
            span,
            value,
          }) = &attrs[i]
          {
            if sym as &str == "className" {
              attrs[i] = JSXAttrOrSpread::JSXAttr(JSXAttr {
                name: JSXAttrName::Ident(Ident {
                  sym: JsWord::from("class"),
                  span: s.clone(),
                  optional: o.clone(),
                }),
                span: span.clone(),
                value: value.clone(),
              })
            }
          }
        }
      }
    }

    JSXOpeningElement {
      name: n,
      attrs,
      span,
      self_closing,
      type_args,
    }
  }
}
