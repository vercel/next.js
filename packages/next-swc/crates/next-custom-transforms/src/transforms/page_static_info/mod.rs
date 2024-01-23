use std::{
    collections::{HashMap, HashSet},
    path::PathBuf,
    sync::Arc,
};

use anyhow::Result;
pub use collect_exported_const_visitor::Const;
use collect_exports_visitor::CollectExportsVisitor;
use once_cell::sync::Lazy;
use regex::Regex;
use serde::{Deserialize, Serialize};
use swc_core::{
    base::{
        config::{IsModule, ParseOptions},
        try_with_handler, Compiler, HandlerOpts, SwcComments,
    },
    common::{errors::ColorConfig, FilePathMapping, SourceMap, GLOBALS},
    ecma::{
        ast::Program,
        parser::{EsConfig, Syntax, TsConfig},
        visit::{VisitWith, VisitWithPath},
    },
};

pub mod collect_exported_const_visitor;
pub mod collect_exports_visitor;

/// Parse given contents of the file as ecmascript via swc's parser.
/// [NOTE] this is being used outside of turbopack (next.js's analysis phase)
/// currently, so we can't use turbopack-ecmascript's parse.
pub fn build_ast_from_source(contents: &str, file_path: &str) -> Result<(Program, SwcComments)> {
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
                    decorators: true,
                    ..Default::default()
                })
            },
            ..Default::default()
        };

        let fm = c.cm.new_source_file(
            swc_core::common::FileName::Real(PathBuf::from(file_path.to_string())),
            contents.to_string(),
        );

        let comments = c.comments().clone();

        try_with_handler(
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
                    Some(&comments),
                )
            },
        )
        .map(|p| (p, comments))
    })
}

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

#[derive(Debug, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExportInfoWarning {
    pub key: String,
    pub message: String,
}

impl ExportInfoWarning {
    pub fn new(key: String, message: String) -> Self {
        Self { key, message }
    }
}

#[derive(Debug, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExportInfo {
    pub ssr: bool,
    pub ssg: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub runtime: Option<String>,
    #[serde(skip_serializing_if = "Vec::is_empty")]
    pub preferred_region: Vec<String>,
    pub generate_image_metadata: Option<bool>,
    pub generate_sitemaps: Option<bool>,
    pub generate_static_params: bool,
    pub extra_properties: HashSet<String>,
    pub directives: HashSet<String>,
    /// extra properties to bubble up warning messages from visitor,
    /// since this isn't a failure to abort the process.
    pub warnings: Vec<ExportInfoWarning>,
}

/// Collects static page export information for the next.js from given source's
/// AST. This is being used for some places like detecting page
/// is a dynamic route or not, or building a PageStaticInfo object.
pub fn collect_exports(program: &Program) -> Result<Option<ExportInfo>> {
    let mut collect_export_visitor = CollectExportsVisitor::new();
    program.visit_with(&mut collect_export_visitor);

    Ok(collect_export_visitor.export_info)
}

static CLIENT_MODULE_LABEL: Lazy<Regex> = Lazy::new(|| {
    Regex::new(" __next_internal_client_entry_do_not_use__ ([^ ]*) (cjs|auto) ").unwrap()
});
static ACTION_MODULE_LABEL: Lazy<Regex> =
    Lazy::new(|| Regex::new(r#" __next_internal_action_entry_do_not_use__ (\{[^}]+\}) "#).unwrap());

#[derive(Debug, PartialEq, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RscModuleInfo {
    #[serde(rename = "type")]
    pub module_type: String,
    pub actions: Option<Vec<String>>,
    pub is_client_ref: bool,
    pub client_refs: Option<Vec<String>>,
    pub client_entry_type: Option<String>,
}

impl RscModuleInfo {
    pub fn new(module_type: String) -> Self {
        Self {
            module_type,
            actions: None,
            is_client_ref: false,
            client_refs: None,
            client_entry_type: None,
        }
    }
}

/// Parse comments from the given source code and collect the RSC module info.
/// This doesn't use visitor, only read comments to parse necessary information.
pub fn collect_rsc_module_info(
    comments: &SwcComments,
    is_react_server_layer: bool,
) -> RscModuleInfo {
    let mut captured = None;

    for comment in comments.leading.iter() {
        let parsed = comment.iter().find_map(|c| {
            let actions_json = ACTION_MODULE_LABEL.captures(&c.text);
            let client_info_match = CLIENT_MODULE_LABEL.captures(&c.text);

            if actions_json.is_none() && client_info_match.is_none() {
                return None;
            }

            let actions = if let Some(actions_json) = actions_json {
                if let Ok(serde_json::Value::Object(map)) =
                    serde_json::from_str::<serde_json::Value>(&actions_json[1])
                {
                    Some(
                        map.iter()
                            // values for the action json should be a string
                            .map(|(_, v)| v.as_str().unwrap_or_default().to_string())
                            .collect::<Vec<_>>(),
                    )
                } else {
                    None
                }
            } else {
                None
            };

            let is_client_ref = client_info_match.is_some();
            let client_info = client_info_match.map(|client_info_match| {
                (
                    client_info_match[1]
                        .split(',')
                        .map(|s| s.to_string())
                        .collect::<Vec<_>>(),
                    client_info_match[2].to_string(),
                )
            });

            Some((actions, is_client_ref, client_info))
        });

        if captured.is_none() {
            captured = parsed;
            break;
        }
    }

    match captured {
        Some((actions, is_client_ref, client_info)) => {
            if !is_react_server_layer {
                let mut module_info = RscModuleInfo::new("client".to_string());
                module_info.actions = actions;
                module_info.is_client_ref = is_client_ref;
                module_info
            } else {
                let mut module_info = RscModuleInfo::new(if client_info.is_some() {
                    "client".to_string()
                } else {
                    "server".to_string()
                });
                module_info.actions = actions;
                module_info.is_client_ref = is_client_ref;
                if let Some((client_refs, client_entry_type)) = client_info {
                    module_info.client_refs = Some(client_refs);
                    module_info.client_entry_type = Some(client_entry_type);
                }

                module_info
            }
        }
        None => RscModuleInfo::new(if !is_react_server_layer {
            "client".to_string()
        } else {
            "server".to_string()
        }),
    }
}

/// Extracts the value of an exported const variable named `exportedName`
/// (e.g. "export const config = { runtime: 'edge' }") from swc's AST.
/// The value must be one of
///   - string
///   - boolean
///   - number
///   - null
///   - undefined
///   - array containing values listed in this list
///   - object containing values listed in this list
///
/// Returns a map of the extracted values, or either contains corresponding
/// error.
pub fn extract_expored_const_values(
    source_ast: &Program,
    properties_to_extract: HashSet<String>,
) -> HashMap<String, Option<Const>> {
    GLOBALS.set(&Default::default(), || {
        let mut visitor =
            collect_exported_const_visitor::CollectExportedConstVisitor::new(properties_to_extract);

        source_ast.visit_with_path(&mut visitor, &mut Default::default());

        visitor.properties
    })
}

#[cfg(test)]
mod tests {
    use super::{build_ast_from_source, collect_rsc_module_info, RscModuleInfo};

    #[test]
    fn should_parse_server_info() {
        let input = r#"export default function Page() {
            return <p>app-edge-ssr</p>
          }

          export const runtime = 'edge'
          export const maxDuration = 4
          "#;

        let (_, comments) = build_ast_from_source(input, "some-file.js")
            .expect("Should able to parse test fixture input");

        let module_info = collect_rsc_module_info(&comments, true);
        let expected = RscModuleInfo {
            module_type: "server".to_string(),
            actions: None,
            is_client_ref: false,
            client_refs: None,
            client_entry_type: None,
        };

        assert_eq!(module_info, expected);
    }

    #[test]
    fn should_parse_actions_json() {
        let input = r#"
        /* __next_internal_action_entry_do_not_use__ {"ab21efdafbe611287bc25c0462b1e0510d13e48b":"foo"} */ import { createActionProxy } from "private-next-rsc-action-proxy";
        import { encryptActionBoundArgs, decryptActionBoundArgs } from "private-next-rsc-action-encryption";
        export function foo() {}
        import { ensureServerEntryExports } from "private-next-rsc-action-validate";
        ensureServerEntryExports([
            foo
        ]);
        createActionProxy("ab21efdafbe611287bc25c0462b1e0510d13e48b", foo);
        "#;

        let (_, comments) = build_ast_from_source(input, "some-file.js")
            .expect("Should able to parse test fixture input");

        let module_info = collect_rsc_module_info(&comments, true);
        let expected = RscModuleInfo {
            module_type: "server".to_string(),
            actions: Some(vec!["foo".to_string()]),
            is_client_ref: false,
            client_refs: None,
            client_entry_type: None,
        };

        assert_eq!(module_info, expected);
    }

    #[test]
    fn should_parse_client_refs() {
        let input = r#"
        // This is a comment.
        /* __next_internal_client_entry_do_not_use__ default,a,b,c,*,f auto */ const { createProxy  } = require("private-next-rsc-mod-ref-proxy");
        module.exports = createProxy("/some-project/src/some-file.js");
        "#;

        let (_, comments) = build_ast_from_source(input, "some-file.js")
            .expect("Should able to parse test fixture input");

        let module_info = collect_rsc_module_info(&comments, true);

        let expected = RscModuleInfo {
            module_type: "client".to_string(),
            actions: None,
            is_client_ref: true,
            client_refs: Some(vec![
                "default".to_string(),
                "a".to_string(),
                "b".to_string(),
                "c".to_string(),
                "*".to_string(),
                "f".to_string(),
            ]),
            client_entry_type: Some("auto".to_string()),
        };

        assert_eq!(module_info, expected);
    }
}
