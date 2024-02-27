use anyhow::{bail, Context, Result};
use indexmap::{IndexMap, IndexSet};
use serde::{de::DeserializeOwned, Deserialize, Serialize};
use turbo_tasks::{trace::TraceRawVcs, TaskInput, ValueDefault, ValueToString, Vc};
use turbo_tasks_fs::{rope::Rope, util::join_path, File};
use turbopack_binding::{
    swc::core::{
        common::GLOBALS,
        ecma::ast::{Expr, Lit, Program},
    },
    turbo::tasks_fs::{json::parse_json_rope_with_source_context, FileContent, FileSystemPath},
    turbopack::{
        core::{
            asset::AssetContent,
            ident::AssetIdent,
            issue::{Issue, IssueExt, IssueSeverity, IssueStage, OptionStyledString, StyledString},
            module::Module,
            source::Source,
            virtual_source::VirtualSource,
        },
        ecmascript::{
            analyzer::{JsValue, ObjectPart},
            parse::ParseResult,
            utils::StringifyJs,
            EcmascriptModuleAsset,
        },
        turbopack::condition::ContextCondition,
    },
};

use crate::{next_config::NextConfig, next_import_map::get_next_package};

const NEXT_TEMPLATE_PATH: &str = "dist/esm/build/templates";

#[derive(Debug, Clone, Copy, PartialEq, Eq, TaskInput)]
pub enum PathType {
    PagesPage,
    PagesApi,
    Data,
}

/// Converts a filename within the server root into a next pathname.
#[turbo_tasks::function]
pub async fn pathname_for_path(
    server_root: Vc<FileSystemPath>,
    server_path: Vc<FileSystemPath>,
    path_ty: PathType,
) -> Result<Vc<String>> {
    let server_path_value = &*server_path.await?;
    let path = if let Some(path) = server_root.await?.get_path_to(server_path_value) {
        path
    } else {
        bail!(
            "server_path ({}) is not in server_root ({})",
            server_path.to_string().await?,
            server_root.to_string().await?
        )
    };
    let path = match (path_ty, path) {
        // "/" is special-cased to "/index" for data routes.
        (PathType::Data, "") => "/index".to_string(),
        // `get_path_to` always strips the leading `/` from the path, so we need to add
        // it back here.
        (_, path) => format!("/{}", path),
    };

    Ok(Vc::cell(path))
}

// Adapted from https://github.com/vercel/next.js/blob/canary/packages/next/shared/lib/router/utils/get-asset-path-from-route.ts
// TODO(alexkirsz) There's no need to create an intermediate string here (and
// below), we should instead return an `impl Display`.
pub fn get_asset_prefix_from_pathname(pathname: &str) -> String {
    if pathname == "/" {
        "/index".to_string()
    } else if pathname == "/index" || pathname.starts_with("/index/") {
        format!("/index{}", pathname)
    } else {
        pathname.to_string()
    }
}

// Adapted from https://github.com/vercel/next.js/blob/canary/packages/next/shared/lib/router/utils/get-asset-path-from-route.ts
pub fn get_asset_path_from_pathname(pathname: &str, ext: &str) -> String {
    format!("{}{}", get_asset_prefix_from_pathname(pathname), ext)
}

pub async fn foreign_code_context_condition(
    next_config: Vc<NextConfig>,
    project_path: Vc<FileSystemPath>,
) -> Result<ContextCondition> {
    let transpile_packages = next_config.transpile_packages().await?;

    // The next template files are allowed to import the user's code via import
    // mapping, and imports must use the project-level [ResolveOptions] instead
    // of the `node_modules` specific resolve options (the template files are
    // technically node module files).
    let not_next_template_dir = ContextCondition::not(ContextCondition::InPath(
        get_next_package(project_path).join(NEXT_TEMPLATE_PATH.to_string()),
    ));

    let result = if transpile_packages.is_empty() {
        ContextCondition::all(vec![
            ContextCondition::InDirectory("node_modules".to_string()),
            not_next_template_dir,
        ])
    } else {
        ContextCondition::all(vec![
            ContextCondition::InDirectory("node_modules".to_string()),
            not_next_template_dir,
            ContextCondition::not(ContextCondition::any(
                transpile_packages
                    .iter()
                    .map(|package| ContextCondition::InDirectory(format!("node_modules/{package}")))
                    .collect(),
            )),
        ])
    };
    Ok(result)
}

#[derive(
    Default,
    PartialEq,
    Eq,
    Clone,
    Copy,
    Debug,
    TraceRawVcs,
    Serialize,
    Deserialize,
    Hash,
    PartialOrd,
    Ord,
    TaskInput,
)]
#[serde(rename_all = "lowercase")]
pub enum NextRuntime {
    #[default]
    NodeJs,
    #[serde(alias = "experimental-edge")]
    Edge,
}

#[turbo_tasks::value]
#[derive(Default, Clone)]
pub struct NextSourceConfig {
    pub runtime: NextRuntime,

    /// Middleware router matchers
    pub matcher: Option<Vec<String>>,
}

#[turbo_tasks::value_impl]
impl ValueDefault for NextSourceConfig {
    #[turbo_tasks::function]
    pub fn value_default() -> Vc<Self> {
        NextSourceConfig::default().cell()
    }
}

/// An issue that occurred while parsing the page config.
#[turbo_tasks::value(shared)]
pub struct NextSourceConfigParsingIssue {
    ident: Vc<AssetIdent>,
    detail: Vc<StyledString>,
}

#[turbo_tasks::value_impl]
impl Issue for NextSourceConfigParsingIssue {
    #[turbo_tasks::function]
    fn severity(&self) -> Vc<IssueSeverity> {
        IssueSeverity::Warning.into()
    }

    #[turbo_tasks::function]
    fn title(&self) -> Vc<StyledString> {
        StyledString::Text("Unable to parse config export in source file".to_string()).cell()
    }

    #[turbo_tasks::function]
    fn stage(&self) -> Vc<IssueStage> {
        IssueStage::Parse.into()
    }

    #[turbo_tasks::function]
    fn file_path(&self) -> Vc<FileSystemPath> {
        self.ident.path()
    }

    #[turbo_tasks::function]
    fn description(&self) -> Vc<OptionStyledString> {
        Vc::cell(Some(
            StyledString::Text(
                "The exported configuration object in a source file need to have a very specific \
                 format from which some properties can be statically parsed at compiled-time."
                    .to_string(),
            )
            .cell(),
        ))
    }

    #[turbo_tasks::function]
    fn detail(&self) -> Vc<OptionStyledString> {
        Vc::cell(Some(self.detail))
    }
}

#[turbo_tasks::function]
pub async fn parse_config_from_source(module: Vc<Box<dyn Module>>) -> Result<Vc<NextSourceConfig>> {
    if let Some(ecmascript_asset) =
        Vc::try_resolve_downcast_type::<EcmascriptModuleAsset>(module).await?
    {
        if let ParseResult::Ok {
            program: Program::Module(module_ast),
            globals,
            eval_context,
            ..
        } = &*ecmascript_asset.parse().await?
        {
            for item in &module_ast.body {
                if let Some(decl) = item
                    .as_module_decl()
                    .and_then(|mod_decl| mod_decl.as_export_decl())
                    .and_then(|export_decl| export_decl.decl.as_var())
                {
                    for decl in &decl.decls {
                        let decl_ident = decl.name.as_ident();

                        // Check if there is exported config object `export const config = {...}`
                        // https://nextjs.org/docs/app/building-your-application/routing/middleware#matcher
                        if decl_ident
                            .map(|ident| &*ident.sym == "config")
                            .unwrap_or_default()
                        {
                            if let Some(init) = decl.init.as_ref() {
                                return GLOBALS.set(globals, || {
                                    let value = eval_context.eval(init);
                                    Ok(parse_config_from_js_value(module, &value).cell())
                                });
                            } else {
                                NextSourceConfigParsingIssue {
                                    ident: module.ident(),
                                    detail: StyledString::Text(
                                        "The exported config object must contain an variable \
                                         initializer."
                                            .to_string(),
                                    )
                                    .cell(),
                                }
                                .cell()
                                .emit()
                            }
                        }
                        // Or, check if there is segment runtime option
                        // https://nextjs.org/docs/app/building-your-application/rendering/edge-and-nodejs-runtimes#segment-runtime-Option
                        else if decl_ident
                            .map(|ident| &*ident.sym == "runtime")
                            .unwrap_or_default()
                        {
                            let runtime_value_issue = NextSourceConfigParsingIssue {
                                ident: module.ident(),
                                detail: StyledString::Text(
                                    "The runtime property must be either \"nodejs\" or \"edge\"."
                                        .to_string(),
                                )
                                .cell(),
                            }
                            .cell();
                            if let Some(init) = decl.init.as_ref() {
                                // skipping eval and directly read the expr's value, as we know it
                                // should be a const string
                                if let Expr::Lit(Lit::Str(str_value)) = &**init {
                                    let mut config = NextSourceConfig::default();

                                    let runtime = str_value.value.to_string();
                                    match runtime.as_str() {
                                        "edge" | "experimental-edge" => {
                                            config.runtime = NextRuntime::Edge;
                                        }
                                        "nodejs" => {
                                            config.runtime = NextRuntime::NodeJs;
                                        }
                                        _ => {
                                            runtime_value_issue.emit();
                                        }
                                    }

                                    return Ok(config.cell());
                                } else {
                                    runtime_value_issue.emit();
                                }
                            } else {
                                NextSourceConfigParsingIssue {
                                    ident: module.ident(),
                                    detail: StyledString::Text(
                                        "The exported segment runtime option must contain an \
                                         variable initializer."
                                            .to_string(),
                                    )
                                    .cell(),
                                }
                                .cell()
                                .emit()
                            }
                        }
                    }
                }
            }
        }
    }
    Ok(Default::default())
}

fn parse_config_from_js_value(module: Vc<Box<dyn Module>>, value: &JsValue) -> NextSourceConfig {
    let mut config = NextSourceConfig::default();
    let invalid_config = |detail: &str, value: &JsValue| {
        let (explainer, hints) = value.explain(2, 0);
        NextSourceConfigParsingIssue {
            ident: module.ident(),
            detail: StyledString::Text(format!("{detail} Got {explainer}.{hints}")).cell(),
        }
        .cell()
        .emit()
    };
    if let JsValue::Object { parts, .. } = value {
        for part in parts {
            match part {
                ObjectPart::Spread(_) => invalid_config(
                    "Spread properties are not supported in the config export.",
                    value,
                ),
                ObjectPart::KeyValue(key, value) => {
                    if let Some(key) = key.as_str() {
                        if key == "runtime" {
                            if let JsValue::Constant(runtime) = value {
                                if let Some(runtime) = runtime.as_str() {
                                    match runtime {
                                        "edge" | "experimental-edge" => {
                                            config.runtime = NextRuntime::Edge;
                                        }
                                        "nodejs" => {
                                            config.runtime = NextRuntime::NodeJs;
                                        }
                                        _ => {
                                            invalid_config(
                                                "The runtime property must be either \"nodejs\" \
                                                 or \"edge\".",
                                                value,
                                            );
                                        }
                                    }
                                }
                            } else {
                                invalid_config(
                                    "The runtime property must be a constant string.",
                                    value,
                                );
                            }
                        }
                        if key == "matcher" {
                            let mut matchers = vec![];
                            match value {
                                JsValue::Constant(matcher) => {
                                    if let Some(matcher) = matcher.as_str() {
                                        matchers.push(matcher.to_string());
                                    } else {
                                        invalid_config(
                                            "The matcher property must be a string or array of \
                                             strings",
                                            value,
                                        );
                                    }
                                }
                                JsValue::Array { items, .. } => {
                                    for item in items {
                                        if let Some(matcher) = item.as_str() {
                                            matchers.push(matcher.to_string());
                                        } else {
                                            invalid_config(
                                                "The matcher property must be a string or array \
                                                 of strings",
                                                value,
                                            );
                                        }
                                    }
                                }
                                _ => invalid_config(
                                    "The matcher property must be a string or array of strings",
                                    value,
                                ),
                            }
                            config.matcher = Some(matchers);
                        }
                    } else {
                        invalid_config(
                            "The exported config object must not contain non-constant strings.",
                            key,
                        );
                    }
                }
            }
        }
    } else {
        invalid_config(
            "The exported config object must be a valid object literal.",
            value,
        );
    }

    config
}

/// Loads a next.js template, replaces `replacements` and `injections` and makes
/// sure there are none left over.
pub async fn load_next_js_template(
    path: &str,
    project_path: Vc<FileSystemPath>,
    replacements: IndexMap<&'static str, String>,
    injections: IndexMap<&'static str, String>,
    imports: IndexMap<&'static str, Option<String>>,
) -> Result<Vc<Box<dyn Source>>> {
    let path = virtual_next_js_template_path(project_path, path.to_string());

    let content = &*file_content_rope(path.read()).await?;
    let content = content.to_str()?.to_string();

    let parent_path = path.parent();
    let parent_path_value = &*parent_path.await?;

    let package_root = get_next_package(project_path).parent();
    let package_root_value = &*package_root.await?;

    /// See [regex::Regex::replace_all].
    fn replace_all<E>(
        re: &regex::Regex,
        haystack: &str,
        mut replacement: impl FnMut(&regex::Captures) -> Result<String, E>,
    ) -> Result<String, E> {
        let mut new = String::with_capacity(haystack.len());
        let mut last_match = 0;
        for caps in re.captures_iter(haystack) {
            let m = caps.get(0).unwrap();
            new.push_str(&haystack[last_match..m.start()]);
            new.push_str(&replacement(&caps)?);
            last_match = m.end();
        }
        new.push_str(&haystack[last_match..]);
        Ok(new)
    }

    // Update the relative imports to be absolute. This will update any relative
    // imports to be relative to the root of the `next` package.
    let regex = lazy_regex::regex!("(?:from \"(\\..*)\"|import \"(\\..*)\")");

    let mut count = 0;
    let mut content = replace_all(regex, &content, |caps| {
        let from_request = caps.get(1).map_or("", |c| c.as_str());
        let import_request = caps.get(2).map_or("", |c| c.as_str());

        count += 1;
        let is_from_request = !from_request.is_empty();

        let imported = FileSystemPath {
            fs: package_root_value.fs,
            path: join_path(
                &parent_path_value.path,
                if is_from_request {
                    from_request
                } else {
                    import_request
                },
            )
            .context("path should not leave the fs")?,
        };

        let relative = package_root_value
            .get_relative_path_to(&imported)
            .context("path has to be relative to package root")?;

        if !relative.starts_with("./next/") {
            bail!(
                "Invariant: Expected relative import to start with \"./next/\", found \"{}\"",
                relative
            )
        }

        let relative = relative
            .strip_prefix("./")
            .context("should be able to strip the prefix")?;

        Ok(if is_from_request {
            format!("from {}", StringifyJs(relative))
        } else {
            format!("import {}", StringifyJs(relative))
        })
    })
    .context("replacing imports failed")?;

    // Verify that at least one import was replaced. It's the case today where
    // every template file has at least one import to update, so this ensures that
    // we don't accidentally remove the import replacement code or use the wrong
    // template file.
    if count == 0 {
        bail!("Invariant: Expected to replace at least one import")
    }

    // Replace all the template variables with the actual values. If a template
    // variable is missing, throw an error.
    let mut replaced = IndexSet::new();
    for (key, replacement) in &replacements {
        let full = format!("\"{}\"", key);

        if content.contains(&full) {
            replaced.insert(*key);
            content = content.replace(&full, &StringifyJs(&replacement).to_string());
        }
    }

    // Check to see if there's any remaining template variables.
    let regex = lazy_regex::regex!("/VAR_[A-Z_]+");
    let matches = regex
        .find_iter(&content)
        .map(|m| m.as_str().to_string())
        .collect::<Vec<_>>();

    if !matches.is_empty() {
        bail!(
            "Invariant: Expected to replace all template variables, found {}",
            matches.join(", "),
        )
    }

    // Check to see if any template variable was provided but not used.
    if replaced.len() != replacements.len() {
        // Find the difference between the provided replacements and the replaced
        // template variables. This will let us notify the user of any template
        // variables that were not used but were provided.
        let difference = replacements
            .keys()
            .filter(|k| !replaced.contains(*k))
            .cloned()
            .collect::<Vec<_>>();

        bail!(
            "Invariant: Expected to replace all template variables, missing {} in template",
            difference.join(", "),
        )
    }

    // Replace the injections.
    let mut injected = IndexSet::new();
    for (key, injection) in &injections {
        let full = format!("// INJECT:{}", key);

        if content.contains(&full) {
            // Track all the injections to ensure that we're not missing any.
            injected.insert(*key);
            content = content.replace(&full, &format!("const {} = {}", key, injection));
        }
    }

    // Check to see if there's any remaining injections.
    let regex = lazy_regex::regex!("// INJECT:[A-Za-z0-9_]+");
    let matches = regex
        .find_iter(&content)
        .map(|m| m.as_str().to_string())
        .collect::<Vec<_>>();

    if !matches.is_empty() {
        bail!(
            "Invariant: Expected to inject all injections, found {}",
            matches.join(", "),
        )
    }

    // Check to see if any injection was provided but not used.
    if injected.len() != injections.len() {
        // Find the difference between the provided replacements and the replaced
        // template variables. This will let us notify the user of any template
        // variables that were not used but were provided.
        let difference = injections
            .keys()
            .filter(|k| !injected.contains(*k))
            .cloned()
            .collect::<Vec<_>>();

        bail!(
            "Invariant: Expected to inject all injections, missing {} in template",
            difference.join(", "),
        )
    }

    // Replace the optional imports.
    let mut imports_added = IndexSet::new();
    for (key, import_path) in &imports {
        let mut full = format!("// OPTIONAL_IMPORT:{}", key);
        let namespace = if !content.contains(&full) {
            full = format!("// OPTIONAL_IMPORT:* as {}", key);
            if content.contains(&full) {
                true
            } else {
                continue;
            }
        } else {
            false
        };

        // Track all the imports to ensure that we're not missing any.
        imports_added.insert(*key);

        if let Some(path) = import_path {
            content = content.replace(
                &full,
                &format!(
                    "import {}{} from {}",
                    if namespace { "* as " } else { "" },
                    key,
                    &StringifyJs(&path).to_string()
                ),
            );
        } else {
            content = content.replace(&full, &format!("const {} = null", key));
        }
    }

    // Check to see if there's any remaining imports.
    let regex = lazy_regex::regex!("// OPTIONAL_IMPORT:(\\* as )?[A-Za-z0-9_]+");
    let matches = regex
        .find_iter(&content)
        .map(|m| m.as_str().to_string())
        .collect::<Vec<_>>();

    if !matches.is_empty() {
        bail!(
            "Invariant: Expected to inject all imports, found {}",
            matches.join(", "),
        )
    }

    // Check to see if any import was provided but not used.
    if imports_added.len() != imports.len() {
        // Find the difference between the provided imports and the injected
        // imports. This will let us notify the user of any imports that were
        // not used but were provided.
        let difference = imports
            .keys()
            .filter(|k| !imports_added.contains(*k))
            .cloned()
            .collect::<Vec<_>>();

        bail!(
            "Invariant: Expected to inject all imports, missing {} in template",
            difference.join(", "),
        )
    }

    // Ensure that the last line is a newline.
    if !content.ends_with('\n') {
        content.push('\n');
    }

    let file = File::from(content);

    let source = VirtualSource::new(path, AssetContent::file(file.into()));

    Ok(Vc::upcast(source))
}

#[turbo_tasks::function]
pub async fn file_content_rope(content: Vc<FileContent>) -> Result<Vc<Rope>> {
    let content = &*content.await?;

    let FileContent::Content(file) = content else {
        bail!("Expected file content for file");
    };

    Ok(file.content().to_owned().cell())
}

pub fn virtual_next_js_template_path(
    project_path: Vc<FileSystemPath>,
    file: String,
) -> Vc<FileSystemPath> {
    debug_assert!(!file.contains('/'));
    get_next_package(project_path).join(format!("{NEXT_TEMPLATE_PATH}/{file}"))
}

pub async fn load_next_js_templateon<T: DeserializeOwned>(
    project_path: Vc<FileSystemPath>,
    path: String,
) -> Result<T> {
    let file_path = get_next_package(project_path).join(path.clone());

    let content = &*file_path.read().await?;

    let FileContent::Content(file) = content else {
        bail!("Expected file content at {}", path);
    };

    let result: T = parse_json_rope_with_source_context(file.content())?;

    Ok(result)
}
