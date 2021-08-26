use swc_common::DUMMY_SP;
use swc_css::ast::*;
use swc_css::parser::{parse_str, parser::ParserConfig};
use swc_css::visit::{VisitMut, VisitMutWith};
use swc_css_codegen::{
  writer::basic::{BasicCssWriter, BasicCssWriterConfig},
  CodegenConfig, Emit,
};
use swc_ecmascript::ast::{Expr, Str, StrKind, Tpl, TplElement};
use swc_stylis::prefixer::prefixer;

use super::{hash_string, string_literal_expr, JSXStyleInfo};

pub fn transform_css(style_info: JSXStyleInfo, class_name: &Option<String>) -> Expr {
  let mut ss: Stylesheet = parse_str(
    &style_info.css,
    style_info.css_span.lo,
    style_info.css_span.hi,
    ParserConfig {
      parse_values: false,
    },
  )
  .unwrap();
  // ? Do we need to support optionally prefixing?
  ss.visit_mut_with(&mut prefixer());
  ss.visit_mut_with(&mut Namespacer {
    class_name: match class_name {
      Some(s) => s.clone(),
      None => format!("jsx-{}", &hash_string(&style_info.hash)),
    },
    is_global: style_info.is_global,
    is_dynamic: style_info.is_dynamic,
  });

  let mut s = String::new();
  {
    let mut wr = BasicCssWriter::new(&mut s, BasicCssWriterConfig { indent: "  " });
    let mut gen = swc_css_codegen::CodeGenerator::new(&mut wr, CodegenConfig { minify: true });

    gen.emit(&ss).unwrap();
  }

  if style_info.expressions.len() == 0 {
    return string_literal_expr(&s);
  }

  let parts: Vec<&str> = s.split("__styled-jsx-placeholder__").collect();
  let mut final_expressions = vec![];
  for i in 0..parts.len() - 1 {
    final_expressions.push(&style_info.expressions[i]);
  }

  Expr::Tpl(Tpl {
    quasis: parts
      .iter()
      .map(|quasi| TplElement {
        cooked: None, // ? Do we need cooked as well
        raw: Str {
          value: String::from(*quasi).into(),
          span: DUMMY_SP,
          has_escape: false,
          kind: StrKind::Synthesized {},
        },
        span: DUMMY_SP,
        tail: false,
      })
      .collect(),
    exprs: style_info.expressions,
    span: DUMMY_SP,
  })
}

struct Namespacer {
  class_name: String,
  is_global: bool,
  is_dynamic: bool,
}

impl VisitMut for Namespacer {
  fn visit_mut_compound_selector(&mut self, node: &mut CompoundSelector) {
    let mut global_selector = None;
    let mut pseudo_index = None;
    for i in 0..node.subclass_selectors.len() {
      let selector = &node.subclass_selectors[i];
      if let SubclassSelector::Pseudo(PseudoSelector { name, args, .. }) = selector {
        if &name.value == "global" {
          if args.tokens.len() != 1 {
            panic!("Passing something other than one type selector to global is not supported yet");
          }
          for token_and_span in &args.tokens {
            if let Token::Ident(ident) = &token_and_span.token {
              global_selector = Some(ident);
            }
          }
        } else if let None = pseudo_index {
          pseudo_index = Some(i);
        }
      }
    }

    if let Some(selector) = global_selector {
      node.type_selector = Some(NamespacedName {
        name: Text {
          value: selector.clone(),
          span: DUMMY_SP,
        },
        prefix: None,
        span: DUMMY_SP,
      });
      node.subclass_selectors.clear();
    } else if !self.is_global {
      let subclass_selector = match self.is_dynamic {
        true => "__jsx-style-dynamic-selector",
        false => &self.class_name,
      };
      let insert_index = match pseudo_index {
        None => node.subclass_selectors.len(),
        Some(i) => i,
      };
      node.subclass_selectors.insert(
        insert_index,
        SubclassSelector::Class(ClassSelector {
          span: DUMMY_SP,
          text: Text {
            value: subclass_selector.into(),
            span: DUMMY_SP,
          },
        }),
      );
    }
  }
}
