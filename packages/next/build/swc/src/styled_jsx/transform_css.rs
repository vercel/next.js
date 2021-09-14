use easy_error::{bail, Error};
use swc_common::{source_map::Pos, BytePos, Span, SyntaxContext, DUMMY_SP};
use swc_css::ast::*;
use swc_css::parser::{parse_str, parse_tokens, parser::ParserConfig};
use swc_css::visit::{VisitMut, VisitMutWith};
use swc_css_codegen::{
  writer::basic::{BasicCssWriter, BasicCssWriterConfig},
  CodegenConfig, Emit,
};
use swc_ecmascript::ast::{Expr, Str, StrKind, Tpl, TplElement};
use swc_ecmascript::utils::HANDLER;
use swc_stylis::prefixer::prefixer;

use super::{hash_string, string_literal_expr, LocalStyle};

pub fn transform_css(
  style_info: &LocalStyle,
  is_global: bool,
  class_name: &Option<String>,
) -> Result<Expr, Error> {
  let result: Result<Stylesheet, _> = parse_str(
    &style_info.css,
    style_info.css_span.lo,
    style_info.css_span.hi,
    ParserConfig {
      parse_values: false,
    },
  );
  let mut ss = match result {
    Ok(ss) => ss,
    Err(_) => {
      HANDLER.with(|handler| {
        handler
          .struct_span_err(
            style_info.css_span,
            "Failed to parse css in styled jsx component",
          )
          .emit()
      });
      bail!("Failed to parse css");
    }
  };
  // ? Do we need to support optionally prefixing?
  ss.visit_mut_with(&mut prefixer());
  ss.visit_mut_with(&mut Namespacer {
    class_name: match class_name {
      Some(s) => s.clone(),
      None => format!("jsx-{}", &hash_string(&style_info.hash)),
    },
    is_global,
    is_dynamic: style_info.is_dynamic,
  });

  let mut s = String::new();
  {
    let mut wr = BasicCssWriter::new(&mut s, BasicCssWriterConfig { indent: "  " });
    let mut gen = swc_css_codegen::CodeGenerator::new(&mut wr, CodegenConfig { minify: true });

    gen.emit(&ss).unwrap();
  }

  if style_info.expressions.len() == 0 {
    return Ok(string_literal_expr(&s));
  }

  let mut parts: Vec<&str> = s.split("__styled-jsx-placeholder__").collect();
  let mut final_expressions = vec![];
  for i in 1..parts.len() {
    let expression_index = parts[i].chars().nth(0).unwrap().to_digit(10).unwrap() as usize;
    final_expressions.push(style_info.expressions[expression_index].clone());
    let substr = &parts[i][1..];
    parts[i] = substr;
  }

  Ok(Expr::Tpl(Tpl {
    quasis: parts
      .iter()
      .map(|quasi| TplElement {
        cooked: None, // ? Do we need cooked as well
        raw: Str {
          value: (*quasi).into(),
          span: DUMMY_SP,
          has_escape: false,
          kind: StrKind::Synthesized {},
        },
        span: DUMMY_SP,
        tail: false,
      })
      .collect(),
    exprs: final_expressions,
    span: DUMMY_SP,
  }))
}

struct Namespacer {
  class_name: String,
  is_global: bool,
  is_dynamic: bool,
}

impl VisitMut for Namespacer {
  fn visit_mut_complex_selector(&mut self, node: &mut ComplexSelector) {
    let mut new_selectors = vec![];
    for selector in &node.selectors {
      let transformed_selectors = self.get_transformed_selectors(selector.clone());
      new_selectors.extend(transformed_selectors);
    }
    node.selectors = new_selectors;
  }
}

impl Namespacer {
  fn get_transformed_selectors(&mut self, mut node: CompoundSelector) -> Vec<CompoundSelector> {
    if self.is_global {
      return vec![node];
    }

    let mut pseudo_index = None;
    for (i, selector) in node.subclass_selectors.iter().enumerate() {
      if let SubclassSelector::Pseudo(PseudoSelector { name, args, .. }) = selector {
        // One off global selector
        if &name.value == "global" {
          let block_tokens = get_block_tokens(&args);
          let mut args = args.clone();
          args.tokens.extend(block_tokens);
          let complex_selectors: Vec<ComplexSelector> = parse_tokens(
            &args,
            ParserConfig {
              parse_values: false,
            },
          )
          .unwrap();
          return complex_selectors[0].selectors.clone();
        } else if pseudo_index.is_none() {
          pseudo_index = Some(i);
        }
      }
    }

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

    vec![node]
  }
}

fn get_block_tokens(selector_tokens: &Tokens) -> Vec<TokenAndSpan> {
  let start_pos = selector_tokens.span.hi.to_u32();
  vec![
    TokenAndSpan {
      span: Span {
        lo: BytePos(start_pos + 0),
        hi: BytePos(start_pos + 1),
        ctxt: SyntaxContext::empty(),
      },
      token: Token::WhiteSpace,
    },
    TokenAndSpan {
      span: Span {
        lo: BytePos(start_pos + 1),
        hi: BytePos(start_pos + 2),
        ctxt: SyntaxContext::empty(),
      },
      token: Token::LBrace,
    },
    TokenAndSpan {
      span: Span {
        lo: BytePos(start_pos + 2),
        hi: BytePos(start_pos + 3),
        ctxt: SyntaxContext::empty(),
      },
      token: Token::WhiteSpace,
    },
    TokenAndSpan {
      span: Span {
        lo: BytePos(start_pos + 3),
        hi: BytePos(start_pos + 8),
        ctxt: SyntaxContext::empty(),
      },
      token: Token::Ident("color".into()),
    },
    TokenAndSpan {
      span: Span {
        lo: BytePos(start_pos + 8),
        hi: BytePos(start_pos + 9),
        ctxt: SyntaxContext::empty(),
      },
      token: Token::Colon,
    },
    TokenAndSpan {
      span: Span {
        lo: BytePos(start_pos + 9),
        hi: BytePos(start_pos + 10),
        ctxt: SyntaxContext::empty(),
      },
      token: Token::WhiteSpace,
    },
    TokenAndSpan {
      span: Span {
        lo: BytePos(start_pos + 10),
        hi: BytePos(start_pos + 13),
        ctxt: SyntaxContext::empty(),
      },
      token: Token::Ident("red".into()),
    },
    TokenAndSpan {
      span: Span {
        lo: BytePos(start_pos + 13),
        hi: BytePos(start_pos + 14),
        ctxt: SyntaxContext::empty(),
      },
      token: Token::Semi,
    },
    TokenAndSpan {
      span: Span {
        lo: BytePos(start_pos + 14),
        hi: BytePos(start_pos + 15),
        ctxt: SyntaxContext::empty(),
      },
      token: Token::WhiteSpace,
    },
    TokenAndSpan {
      span: Span {
        lo: BytePos(start_pos + 15),
        hi: BytePos(start_pos + 16),
        ctxt: SyntaxContext::empty(),
      },
      token: Token::RBrace,
    },
    TokenAndSpan {
      span: Span {
        lo: BytePos(start_pos + 16),
        hi: BytePos(start_pos + 17),
        ctxt: SyntaxContext::empty(),
      },
      token: Token::WhiteSpace,
    },
  ]
}
