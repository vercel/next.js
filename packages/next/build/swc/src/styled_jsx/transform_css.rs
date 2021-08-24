use swc_common::{Span, DUMMY_SP};
use swc_css::ast::*;
use swc_css::parser::{parse_str, parser::ParserConfig};
use swc_css::visit::{VisitMut, VisitMutWith};
use swc_css_codegen::{
  writer::basic::{BasicCssWriter, BasicCssWriterConfig},
  CodegenConfig, Emit,
};
use swc_stylis::prefixer::prefixer;

use super::{hash_string, JSXStyleInfo};

pub fn transform_css(style_info: JSXStyleInfo) -> String {
  let mut ss: Stylesheet = parse_str(
    &style_info.css,
    style_info.css_span.lo,
    style_info.css_span.hi,
    ParserConfig {
      parse_values: false,
    },
  )
  .unwrap();
  ss.visit_mut_with(&mut Namespacer {
    class_name: format!("jsx-{}", &hash_string(&style_info.hash)),
  });

  let mut s = String::new();
  {
    let mut wr = BasicCssWriter::new(&mut s, BasicCssWriterConfig { indent: "  " });
    let mut gen = swc_css_codegen::CodeGenerator::new(&mut wr, CodegenConfig { minify: true });

    gen.emit(&ss).unwrap();
  }

  s
}

struct Namespacer {
  class_name: String,
}

impl VisitMut for Namespacer {
  fn visit_mut_compound_selector(&mut self, node: &mut CompoundSelector) {
    node
      .subclass_selectors
      .push(SubclassSelector::Class(ClassSelector {
        span: DUMMY_SP,
        text: Text {
          value: self.class_name.clone().into(),
          span: DUMMY_SP,
        },
      }));
  }
}
