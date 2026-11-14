use std::ops::Deref;

use anyhow::Result;
use async_trait::async_trait;
use serde_json::Value as JsonValue;
use turbo_rcstr::{RcStr, rcstr};
use turbo_tasks::{NonLocalValue, ReadRef, ResolvedVc, Vc, debug::ValueDebugFormat};
use turbo_tasks_fs::{FileJsonContent, FileSystemPath};

use super::issue::Issue;
use crate::{
    asset::Asset,
    issue::{IssueExt, IssueSource, IssueStage, StyledString},
    source::Source,
};

/// PackageJson wraps the parsed JSON content of a `package.json` file. The
/// wrapper is necessary so that we can reference the [FileJsonContent]'s inner
/// [serde_json::Value] without cloning it.
#[derive(PartialEq, Eq, ValueDebugFormat, NonLocalValue)]
pub struct PackageJson(ReadRef<FileJsonContent>);

impl Deref for PackageJson {
    type Target = JsonValue;
    fn deref(&self) -> &Self::Target {
        match &*self.0 {
            FileJsonContent::Content(json) => json,
            _ => unreachable!("PackageJson is guaranteed to hold Content"),
        }
    }
}

#[turbo_tasks::value(transparent, serialization = "skip")]
pub struct OptionPackageJson(Option<PackageJson>);

/// Reads a package.json file (if it exists). If the file is unparsable, it
/// emits a useful [Issue] pointing to the invalid location.
#[turbo_tasks::function]
pub async fn read_package_json(path: ResolvedVc<Box<dyn Source>>) -> Result<Vc<OptionPackageJson>> {
    let read = path.content().parse_json().await?;
    match &*read {
        FileJsonContent::Content(_) => Ok(OptionPackageJson(Some(PackageJson(read))).cell()),
        FileJsonContent::NotFound => Ok(OptionPackageJson(None).cell()),
        FileJsonContent::Unparsable(e) => {
            let error_message = RcStr::from(format!(
                "package.json is not parseable: invalid JSON: {}",
                e.message
            ));

            let source = IssueSource::from_unparsable_json(path, e);
            PackageJsonIssue {
                error_message,
                source,
            }
            .resolved_cell()
            .emit();
            Ok(OptionPackageJson(None).cell())
        }
    }
}

/// The raw JSON value of a single top-level `package.json` field. `None` when the field is
/// absent, or the `package.json` is missing or unparsable. An explicit `null` is
/// `Some(JsonValue::Null)`.
///
/// Equality is order-sensitive for object keys (unlike [`JsonValue`]'s): key order is semantic,
/// e.g. for conditional `exports`.
#[turbo_tasks::value(shared, serialization = "skip", eq = "manual")]
pub struct PackageJsonFieldValue(pub Option<JsonValue>);

impl PartialEq for PackageJsonFieldValue {
    fn eq(&self, other: &Self) -> bool {
        match (&self.0, &other.0) {
            (Some(a), Some(b)) => json_eq_ordered(a, b),
            (None, None) => true,
            _ => false,
        }
    }
}

impl Eq for PackageJsonFieldValue {}

fn json_eq_ordered(a: &JsonValue, b: &JsonValue) -> bool {
    match (a, b) {
        (JsonValue::Object(a), JsonValue::Object(b)) => {
            a.len() == b.len()
                && a.iter()
                    .zip(b.iter())
                    .all(|((ka, va), (kb, vb))| ka == kb && json_eq_ordered(va, vb))
        }
        (JsonValue::Array(a), JsonValue::Array(b)) => {
            a.len() == b.len() && a.iter().zip(b.iter()).all(|(a, b)| json_eq_ordered(a, b))
        }
        _ => a == b,
    }
}

/// A projection of the `package.json` fields used by resolving, each in its own cell.
///
/// [`package_json_fields`] re-executes on every `package.json` change, but a field's cell only
/// changes when that field's JSON changes, so readers of one field are not invalidated by edits
/// to unrelated fields (`version`, `scripts`, `dependencies`, ...).
#[turbo_tasks::value]
struct PackageJsonFields {
    name: ResolvedVc<PackageJsonFieldValue>,
    exports: ResolvedVc<PackageJsonFieldValue>,
    imports: ResolvedVc<PackageJsonFieldValue>,
    browser: ResolvedVc<PackageJsonFieldValue>,
    main: ResolvedVc<PackageJsonFieldValue>,
    module: ResolvedVc<PackageJsonFieldValue>,
    types: ResolvedVc<PackageJsonFieldValue>,
}

fn field_value(json: Option<&JsonValue>, name: &str) -> PackageJsonFieldValue {
    PackageJsonFieldValue(json.and_then(|json| json.get(name)).cloned())
}

#[turbo_tasks::function]
async fn package_json_fields(path: ResolvedVc<Box<dyn Source>>) -> Result<Vc<PackageJsonFields>> {
    let read = read_package_json(*path).await?;
    let json = read.as_ref().map(|json| &**json);
    // The field cells are always created in the same order, so their identities stay stable
    // across re-executions and this struct compares equal.
    Ok(PackageJsonFields {
        name: field_value(json, "name").resolved_cell(),
        exports: field_value(json, "exports").resolved_cell(),
        imports: field_value(json, "imports").resolved_cell(),
        browser: field_value(json, "browser").resolved_cell(),
        main: field_value(json, "main").resolved_cell(),
        module: field_value(json, "module").resolved_cell(),
        types: field_value(json, "types").resolved_cell(),
    }
    .cell())
}

/// Reads a field that [`PackageJsonFields`] doesn't project (alias and main field names are
/// configurable).
#[turbo_tasks::function]
async fn package_json_other_field(
    path: ResolvedVc<Box<dyn Source>>,
    name: RcStr,
) -> Result<Vc<PackageJsonFieldValue>> {
    let read = read_package_json(*path).await?;
    Ok(field_value(read.as_ref().map(|json| &**json), &name).cell())
}

/// Returns a single top-level field of a `package.json` file. The caller only depends on that
/// field, not on the whole file. A missing or unparsable `package.json` reads as an absent field;
/// the latter also emits a [PackageJsonIssue] (see [read_package_json]).
pub async fn package_json_field(
    path: ResolvedVc<Box<dyn Source>>,
    name: &str,
) -> Result<Vc<PackageJsonFieldValue>> {
    let fields = || async { package_json_fields(*path).await };
    Ok(*match name {
        "name" => fields().await?.name,
        "exports" => fields().await?.exports,
        "imports" => fields().await?.imports,
        "browser" => fields().await?.browser,
        "main" => fields().await?.main,
        "module" => fields().await?.module,
        "types" => fields().await?.types,
        _ => return Ok(package_json_other_field(*path, name.into())),
    })
}

/// Reusable Issue struct representing any problem with a `package.json`
#[turbo_tasks::value(shared)]
pub struct PackageJsonIssue {
    pub error_message: RcStr,
    pub source: IssueSource,
}

#[async_trait]
#[turbo_tasks::value_impl]
impl Issue for PackageJsonIssue {
    async fn title(&self) -> Result<StyledString> {
        Ok(StyledString::Text(rcstr!(
            "Error parsing package.json file"
        )))
    }

    fn stage(&self) -> IssueStage {
        IssueStage::Parse
    }

    async fn file_path(&self) -> Result<FileSystemPath> {
        self.source.file_path().await
    }

    async fn description(&self) -> Result<Option<StyledString>> {
        Ok(Some(StyledString::Text(self.error_message.clone())))
    }

    fn source(&self) -> Option<IssueSource> {
        Some(self.source)
    }
}

#[cfg(test)]
mod tests {
    use anyhow::Result;
    use serde_json::json;
    use turbo_rcstr::{RcStr, rcstr};
    use turbo_tasks::{CollectiblesSource, ResolvedVc, Vc};
    use turbo_tasks_backend::{BackendOptions, TurboTasksBackend, noop_backing_storage};
    use turbo_tasks_fs::{DiskFileSystem, FileSystem};

    use super::{PackageJsonFieldValue, package_json_field};
    use crate::{file_source::FileSource, issue::Issue};

    #[turbo_tasks::value(transparent)]
    struct FieldValues(Vec<Option<String>>);

    /// Reads `fields` of `<root>/<file>`, rendering each value as JSON (`None` when absent).
    #[turbo_tasks::function(operation, root)]
    async fn read_fields_operation(
        root: RcStr,
        file: RcStr,
        fields: Vec<RcStr>,
    ) -> Result<Vc<FieldValues>> {
        let fs = DiskFileSystem::new(rcstr!("temp"), Vc::cell(root));
        let path = fs.root().await?.join(&file)?;
        let source = ResolvedVc::upcast(FileSource::new(path).to_resolved().await?);
        let mut values = Vec::new();
        for field in &fields {
            let value = package_json_field(source, field).await?.await?;
            values.push(value.0.as_ref().map(|value| value.to_string()));
        }
        Ok(Vc::cell(values))
    }

    #[turbo_tasks::value]
    struct FieldValuesAndIssues {
        values: Vec<Option<String>>,
        issues: usize,
    }

    #[turbo_tasks::function(operation, root)]
    async fn read_fields_and_issues_operation(
        root: RcStr,
        file: RcStr,
        fields: Vec<RcStr>,
    ) -> Result<Vc<FieldValuesAndIssues>> {
        let operation = read_fields_operation(root, file, fields);
        let values = operation.connect().owned().await?;
        let issues = operation.peek_collectibles::<Box<dyn Issue>>().len();
        Ok(FieldValuesAndIssues { values, issues }.cell())
    }

    #[tokio::test(flavor = "multi_thread", worker_threads = 2)]
    async fn package_json_field_values() {
        let scratch = tempfile::tempdir().unwrap();
        std::fs::write(
            scratch.path().join("package.json"),
            r#"{"name":"pkg","main":null,"custom":{"a":1}}"#,
        )
        .unwrap();
        std::fs::write(scratch.path().join("invalid.json"), "{").unwrap();
        let root = RcStr::from(scratch.path().to_str().unwrap());

        let tt = turbo_tasks::TurboTasks::new(TurboTasksBackend::new(
            BackendOptions::default(),
            noop_backing_storage(),
        ));
        tt.run_once(async move {
            // Projected fields (`name`, `main`, `browser`) and non-projected ones (`custom`,
            // `missing`). An explicit `null` is distinct from an absent field.
            let fields = vec![
                rcstr!("name"),
                rcstr!("main"),
                rcstr!("browser"),
                rcstr!("custom"),
                rcstr!("missing"),
            ];
            let result =
                read_fields_and_issues_operation(root.clone(), rcstr!("package.json"), fields)
                    .read_strongly_consistent()
                    .await?;
            assert_eq!(
                result.values,
                vec![
                    Some(r#""pkg""#.to_string()),
                    Some("null".to_string()),
                    None,
                    Some(r#"{"a":1}"#.to_string()),
                    None,
                ]
            );
            assert_eq!(result.issues, 0);

            // A missing or unparsable package.json reads as absent fields; only the latter
            // reports an issue (once, though both the projection and the fallback read it).
            for (file, issues) in [
                (rcstr!("does-not-exist.json"), 0),
                (rcstr!("invalid.json"), 1),
            ] {
                let result = read_fields_and_issues_operation(
                    root.clone(),
                    file,
                    vec![rcstr!("name"), rcstr!("custom")],
                )
                .read_strongly_consistent()
                .await?;
                assert_eq!(result.values, vec![None, None]);
                assert_eq!(result.issues, issues);
            }
            anyhow::Ok(())
        })
        .await
        .unwrap();
    }

    #[test]
    fn field_value_equality_is_key_order_sensitive() {
        let value = |json| PackageJsonFieldValue(Some(json));
        assert!(
            value(json!({"a": [1, {"x": 1, "y": 2}], "b": 2}))
                == value(json!({"a": [1, {"x": 1, "y": 2}], "b": 2}))
        );
        assert!(value(json!({"a": 1, "b": 2})) != value(json!({"b": 2, "a": 1})));
        // Also in nested objects and arrays.
        assert!(value(json!([{"x": 1, "y": 2}])) != value(json!([{"y": 2, "x": 1}])));
        assert!(value(json!(null)) != PackageJsonFieldValue(None));
        assert!(PackageJsonFieldValue(None) == PackageJsonFieldValue(None));
    }
}
