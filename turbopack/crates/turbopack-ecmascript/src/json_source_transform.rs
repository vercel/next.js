use anyhow::{Result, bail};
use turbo_rcstr::rcstr;
use turbo_tasks::Vc;
use turbo_tasks_fs::{File, FileContent, FileJsonContent};
use turbopack_core::{
    asset::{Asset, AssetContent},
    issue::{IssueExt, IssueSeverity, IssueSource, StyledString, code_gen::CodeGenerationIssue},
    source::Source,
    source_transform::SourceTransform,
    virtual_source::VirtualSource,
};

use crate::utils::inline_source_map_comment;

/// A source transform that converts a JSON file into a JavaScript module.
///
/// Two modes are supported:
///
/// - **Spec-compliant mode** (`use_esm = true`): Generates an ESM module with only a default
///   export, per the JSON Modules spec. Used for `import ... with { type: 'json' }`.
///
/// - **Webpack-compatible mode** (`use_esm = false`): Generates a CommonJS module via
///   `module.exports`, which allows both default imports and named property imports (e.g., `import
///   { a } from './data.json'`). This matches webpack's historical behavior.
///
/// For JSON files larger than 10KB, we use `JSON.parse()` for better performance.
/// See: https://v8.dev/blog/cost-of-javascript-2019#json
#[turbo_tasks::value]
pub struct JsonSourceTransform {
    /// If true, generate spec-compliant ESM with only an esm default export.
    /// If false, generate CommonJS for webpack compatibility.
    use_esm: bool,
}

#[turbo_tasks::value_impl]
impl JsonSourceTransform {
    /// Create a new JSON transform with webpack-compatible CommonJS output.
    #[turbo_tasks::function]
    pub fn new_cjs() -> Vc<Self> {
        JsonSourceTransform { use_esm: false }.cell()
    }

    /// Create a new JSON transform with spec-compliant ESM output.
    /// Use this for `import ... with { type: 'json' }` imports.
    #[turbo_tasks::function]
    pub fn new_esm() -> Vc<Self> {
        JsonSourceTransform { use_esm: true }.cell()
    }
}

#[turbo_tasks::value_impl]
impl SourceTransform for JsonSourceTransform {
    #[turbo_tasks::function]
    async fn transform(self: Vc<Self>, source: Vc<Box<dyn Source>>) -> Result<Vc<Box<dyn Source>>> {
        let this = self.await?;
        let ident = source.ident();
        let path = ident.path().await?;
        let content = source.content().file_content();

        // Parse the JSON to validate it and get the data
        let data = content.parse_json().await?;
        let (code, extension) = match &*data {
            FileJsonContent::Content(data) => {
                let data_str = data.to_string();

                // The "use turbopack no side effects" directive marks this module as
                // side-effect free for tree shaking
                let mut code = String::with_capacity(
                    data_str.len() + 100, /* estimate to account for our `use` comment, export
                                           * overhead and sourcemap comment */
                );
                code.push_str("\"use turbopack no side effects\";\n");

                let extension = if this.use_esm {
                    // Spec-compliant ESM: only default export
                    code.push_str("export default ");
                    "mjs"
                } else {
                    // Webpack-compatible CommonJS: allows named property imports
                    code.push_str("module.exports = ");
                    "cjs"
                };
                // For large JSON files, wrap in JSON.parse for better performance
                // https://v8.dev/blog/cost-of-javascript-2019#json
                if data_str.len() > 10_000 {
                    code.push_str("JSON.parse(");
                    code.push_str(&serde_json::to_string(&data_str)?);
                    code.push(')');
                } else {
                    code.push_str(&data_str);
                }
                code.push_str(";\n");
                code.push_str(&inline_source_map_comment(&path.path, &data_str));

                (code, extension)
            }
            FileJsonContent::Unparsable(e) => {
                let resolved_source = source.to_resolved().await?;
                let issue_source = IssueSource::from_unparsable_json(resolved_source, e);

                CodeGenerationIssue {
                    severity: IssueSeverity::Error,
                    path: ident.path().owned().await?,
                    title: StyledString::Text(rcstr!("Unable to make a module from invalid JSON"))
                        .resolved_cell(),
                    message: StyledString::Text(e.message.clone()).resolved_cell(),
                    source: Some(issue_source),
                }
                .resolved_cell()
                .emit();

                let js_error_message = serde_json::to_string(&format!(
                    "Unable to make a module from invalid JSON: {}",
                    e.message
                ))?;
                (format!("throw new Error({js_error_message});"), "js")
            }
            FileJsonContent::NotFound => {
                // This is basically impossible since we wouldn't be called if the module
                // doesn't exist but some kind of eventual consistency situation is
                // possible where we resolve the file and then it disappears, so bail is appropriate
                bail!("JSON file not found: {:?}", path);
            }
        };

        let new_ident = ident.rename_as(format!("{}.[json].{}", path.path, extension).into());

        Ok(Vc::upcast(VirtualSource::new_with_ident(
            new_ident,
            AssetContent::file(FileContent::Content(File::from(code)).cell()),
        )))
    }
}
