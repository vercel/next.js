use std::{path::PathBuf, sync::Arc};

use anyhow::Context as _;
use napi::bindgen_prelude::*;
use swc_core::{
    common::{SourceMap, GLOBALS},
    ecma::{
        ast::{Callee, EsVersion, Expr, FnDecl, Program, ReturnStmt},
        parser::{parse_file_as_program, Syntax, TsSyntax},
        visit::{Visit, VisitWith},
    },
};

use crate::util::MapErr;

pub struct CheckTask {
    pub filename: PathBuf,
}

#[napi]
impl Task for CheckTask {
    type Output = bool;
    type JsValue = bool;

    fn compute(&mut self) -> napi::Result<Self::Output> {
        GLOBALS.set(&Default::default(), || {
            //
            let cm = Arc::new(SourceMap::default());
            let fm = cm
                .load_file(&self.filename.clone())
                .context("failed to load file")
                .convert_err()?;
            let mut errors = vec![];
            let Ok(program) = parse_file_as_program(
                &fm,
                Syntax::Typescript(TsSyntax {
                    tsx: true,
                    ..Default::default()
                }),
                EsVersion::EsNext,
                None,
                &mut errors,
            ) else {
                return Ok(false);
            };
            if !errors.is_empty() {
                return Ok(false);
            }

            Ok(is_required(&program))
        })
    }

    fn resolve(&mut self, _env: Env, result: Self::Output) -> napi::Result<Self::JsValue> {
        Ok(result)
    }
}

#[napi]
pub fn is_react_compiler_required(
    filename: String,
    signal: Option<AbortSignal>,
) -> AsyncTask<CheckTask> {
    let filename = PathBuf::from(filename);
    AsyncTask::with_optional_signal(CheckTask { filename }, signal)
}

fn is_required(program: &Program) -> bool {
    let mut finder = Finder::default();
    finder.visit_program(program);
    finder.found
}

#[derive(Default)]
struct Finder {
    found: bool,

    /// We are in a function that starts with a capital letter or it's a function that starts with
    /// `use`
    is_interested: bool,
}

impl Visit for Finder {
    fn visit_callee(&mut self, node: &Callee) {
        if self.is_interested {
            if let Callee::Expr(e) = node {
                if let Expr::Ident(c) = &**e {
                    if c.sym.starts_with("use") {
                        self.found = true;
                        return;
                    }
                }
            }
        }

        node.visit_children_with(self);
    }

    fn visit_fn_decl(&mut self, node: &FnDecl) {
        let old = self.is_interested;
        self.is_interested = node.ident.sym.starts_with("use")
            || node.ident.sym.starts_with(|c: char| c.is_ascii_uppercase());

        node.visit_children_with(self);

        self.is_interested = old;
    }

    fn visit_return_stmt(&mut self, node: &ReturnStmt) {
        if self.is_interested {
            if let Some(Expr::JSXElement(..) | Expr::JSXEmpty(..) | Expr::JSXFragment(..)) =
                node.arg.as_deref()
            {
                self.found = true;
                return;
            }
        }

        node.visit_children_with(self);
    }
}
