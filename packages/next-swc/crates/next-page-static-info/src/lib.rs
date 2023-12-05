#![feature(box_patterns)]

use std::{collections::HashSet, path::PathBuf, sync::Arc};

use anyhow::Result;
use collect_exports_visitor::CollectExportsVisitor;
use swc_core::{
    base::{
        config::{IsModule, ParseOptions},
        try_with_handler, Compiler, HandlerOpts,
    },
    common::{errors::ColorConfig, FilePathMapping, SourceMap, GLOBALS},
    ecma::{
        parser::{EsConfig, Syntax, TsConfig},
        visit::VisitWith,
    },
};

mod collect_exports_visitor;

#[derive(Debug, Default)]
pub struct MiddlewareConfig {}

#[derive(Debug)]
pub enum Amp {
    Boolean(bool),
    Hybrid,
}

#[derive(Debug, Default)]
pub struct PageStaticInfo {
    // [TODO] next-core have NextRuntime type, but the order of dependency won't allow to import
    // Since this value is being passed into JS context anyway, we can just use string for now.
    pub runtime: Option<String>, // 'nodejs' | 'experimental-edge' | 'edge'
    pub preferred_region: Vec<String>,
    pub ssg: Option<bool>,
    pub ssr: Option<bool>,
    pub rsc: Option<String>, // 'server' | 'client'
    pub generate_static_params: Option<bool>,
    pub middleware: Option<MiddlewareConfig>,
    pub amp: Option<Amp>,
}

#[derive(Debug, Default)]
pub struct ExportInfo {
    pub ssr: bool,
    pub ssg: bool,
    pub runtime: Option<String>,
    pub preferred_region: Option<Vec<String>>,
    pub generate_image_metadata: Option<bool>,
    pub generate_sitemaps: Option<bool>,
    pub generate_static_params: bool,
    pub extra_properties: HashSet<String>,
    pub directives: HashSet<String>,
    /// extra properties to bubble up warning messages from visitor,
    /// since this isn't a failure to abort the process.
    pub warnings: Vec<(String, String)>,
}

/// Parse given contents of the file as ecmascript via
/// SWC's parser, then collects static page export information
/// for the next.js
/// This is being used for some places like detecting page
/// is a dynamic route or not, or building a PageStaticInfo object.
///
/// Optional predicate determines if it can be short-curcuited: if predicate
/// returns true, it will return default object without parsing the entire
/// contents.
pub fn collect_exports(contents: &str, file_path: &str) -> Result<ExportInfo> {
    GLOBALS.set(&Default::default(), || {
        let c = Compiler::new(Arc::new(SourceMap::new(FilePathMapping::empty())));

        let options = ParseOptions {
            is_module: IsModule::Unknown,
            syntax: if file_path.ends_with(".ts") || file_path.ends_with(".tsx") {
                Syntax::Typescript(TsConfig {
                    tsx: true,
                    decorators: true,
                    ..Default::default()
                })
            } else {
                Syntax::Es(EsConfig {
                    jsx: true,
                    ..Default::default()
                })
            },
            ..Default::default()
        };

        let fm = c.cm.new_source_file(
            swc_core::common::FileName::Real(PathBuf::from(file_path.to_string())),
            contents.to_string(),
        );

        let program = try_with_handler(
            c.cm.clone(),
            HandlerOpts {
                color: ColorConfig::Never,
                skip_filename: false,
            },
            |handler| {
                c.parse_js(
                    fm,
                    handler,
                    options.target,
                    options.syntax,
                    options.is_module,
                    None,
                )
            },
        );

        match program {
            Ok(program) => {
                let mut collect_export_visitor = CollectExportsVisitor::new();
                program.visit_with(&mut collect_export_visitor);

                Ok(collect_export_visitor.export_info)
            }
            Err(err) => Err(err),
        }
    })
}
