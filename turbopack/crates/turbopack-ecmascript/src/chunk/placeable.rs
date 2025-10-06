use anyhow::Result;
use turbo_rcstr::rcstr;
use turbo_tasks::{ResolvedVc, TryFlatJoinIterExt, Vc};
use turbo_tasks_fs::{
    FileJsonContent, FileSystemPath,
    glob::{Glob, GlobOptions},
};
use turbopack_core::{
    asset::Asset,
    chunk::ChunkableModule,
    error::PrettyPrintError,
    file_source::FileSource,
    issue::{
        Issue, IssueExt, IssueSeverity, IssueSource, IssueStage, OptionIssueSource,
        OptionStyledString, StyledString,
    },
    module::Module,
    resolve::{FindContextFileResult, find_context_file, package_json},
};

use crate::references::{
    async_module::OptionAsyncModule,
    esm::{EsmExport, EsmExports},
};

#[turbo_tasks::value_trait]
pub trait EcmascriptChunkPlaceable: ChunkableModule + Module + Asset {
    #[turbo_tasks::function]
    fn get_exports(self: Vc<Self>) -> Vc<EcmascriptExports>;
    #[turbo_tasks::function]
    fn get_async_module(self: Vc<Self>) -> Vc<OptionAsyncModule> {
        Vc::cell(None)
    }
    #[turbo_tasks::function]
    async fn is_marked_as_side_effect_free(
        self: Vc<Self>,
        side_effect_free_packages: Vc<Glob>,
    ) -> Result<Vc<bool>> {
        Ok(is_marked_as_side_effect_free(
            self.ident().path().owned().await?,
            side_effect_free_packages,
        ))
    }
}

#[turbo_tasks::value]
enum SideEffectsValue {
    None,
    Constant(bool),
    Glob(ResolvedVc<Glob>),
}

#[turbo_tasks::function]
async fn side_effects_from_package_json(
    package_json: FileSystemPath,
) -> Result<Vc<SideEffectsValue>> {
    let package_json_file = FileSource::new(package_json).to_resolved().await?;
    let package_json = &*package_json_file.content().parse_json().await?;
    if let FileJsonContent::Content(content) = package_json
        && let Some(side_effects) = content.get("sideEffects")
    {
        if let Some(side_effects) = side_effects.as_bool() {
            return Ok(SideEffectsValue::Constant(side_effects).cell());
        } else if let Some(side_effects) = side_effects.as_array() {
            let globs = side_effects
                .iter()
                .filter_map(|side_effect| {
                    if let Some(side_effect) = side_effect.as_str() {
                        if side_effect.contains('/') {
                            Some(Glob::new(
                                side_effect.strip_prefix("./").unwrap_or(side_effect).into(),
                                GlobOptions::default(),
                            ))
                        } else {
                            Some(Glob::new(
                                format!("**/{side_effect}").into(),
                                GlobOptions::default(),
                            ))
                        }
                    } else {
                        SideEffectsInPackageJsonIssue {
                            // TODO(PACK-4879): This should point at the buggy element
                            source: IssueSource::from_source_only(ResolvedVc::upcast(
                                package_json_file,
                            )),
                            description: Some(
                                StyledString::Text(
                                    format!(
                                        "Each element in sideEffects must be a string, but found \
                                         {side_effect:?}"
                                    )
                                    .into(),
                                )
                                .resolved_cell(),
                            ),
                        }
                        .resolved_cell()
                        .emit();
                        None
                    }
                })
                .map(|glob| async move {
                    match glob.resolve().await {
                        Ok(glob) => Ok(Some(glob)),
                        Err(err) => {
                            SideEffectsInPackageJsonIssue {
                                // TODO(PACK-4879): This should point at the buggy glob
                                source: IssueSource::from_source_only(ResolvedVc::upcast(
                                    package_json_file,
                                )),
                                description: Some(
                                    StyledString::Text(
                                        format!(
                                            "Invalid glob in sideEffects: {}",
                                            PrettyPrintError(&err)
                                        )
                                        .into(),
                                    )
                                    .resolved_cell(),
                                ),
                            }
                            .resolved_cell()
                            .emit();
                            Ok(None)
                        }
                    }
                })
                .try_flat_join()
                .await?;
            return Ok(
                SideEffectsValue::Glob(Glob::alternatives(globs).to_resolved().await?).cell(),
            );
        } else {
            SideEffectsInPackageJsonIssue {
                // TODO(PACK-4879): This should point at the buggy value
                source: IssueSource::from_source_only(ResolvedVc::upcast(package_json_file)),
                description: Some(
                    StyledString::Text(
                        format!(
                            "sideEffects must be a boolean or an array, but found {side_effects:?}"
                        )
                        .into(),
                    )
                    .resolved_cell(),
                ),
            }
            .resolved_cell()
            .emit();
        }
    }
    Ok(SideEffectsValue::None.cell())
}

#[turbo_tasks::value]
struct SideEffectsInPackageJsonIssue {
    source: IssueSource,
    description: Option<ResolvedVc<StyledString>>,
}

#[turbo_tasks::value_impl]
impl Issue for SideEffectsInPackageJsonIssue {
    #[turbo_tasks::function]
    fn stage(&self) -> Vc<IssueStage> {
        IssueStage::Parse.into()
    }

    fn severity(&self) -> IssueSeverity {
        IssueSeverity::Warning
    }

    #[turbo_tasks::function]
    fn file_path(&self) -> Vc<FileSystemPath> {
        self.source.file_path()
    }

    #[turbo_tasks::function]
    fn title(&self) -> Vc<StyledString> {
        StyledString::Text(rcstr!("Invalid value for sideEffects in package.json")).cell()
    }

    #[turbo_tasks::function]
    fn description(&self) -> Vc<OptionStyledString> {
        Vc::cell(self.description)
    }

    #[turbo_tasks::function]
    fn source(&self) -> Vc<OptionIssueSource> {
        Vc::cell(Some(self.source))
    }
}

#[turbo_tasks::function]
pub async fn is_marked_as_side_effect_free(
    path: FileSystemPath,
    side_effect_free_packages: Vc<Glob>,
) -> Result<Vc<bool>> {
    if side_effect_free_packages.await?.matches(&path.path) {
        return Ok(Vc::cell(true));
    }

    let find_package_json = find_context_file(path.parent(), package_json(), false).await?;

    if let FindContextFileResult::Found(package_json, _) = &*find_package_json {
        match *side_effects_from_package_json(package_json.clone()).await? {
            SideEffectsValue::None => {}
            SideEffectsValue::Constant(side_effects) => return Ok(Vc::cell(!side_effects)),
            SideEffectsValue::Glob(glob) => {
                if let Some(rel_path) = package_json.parent().get_relative_path_to(&path) {
                    let rel_path = rel_path.strip_prefix("./").unwrap_or(&rel_path);
                    return Ok(Vc::cell(!glob.await?.matches(rel_path)));
                }
            }
        }
    }

    Ok(Vc::cell(false))
}

#[turbo_tasks::value(shared)]
pub enum EcmascriptExports {
    /// A module using ESM exports.
    EsmExports(ResolvedVc<EsmExports>),
    /// A module using `__turbopack_export_namespace__`, used by custom module types.
    DynamicNamespace,
    /// A module using CommonJS exports.
    CommonJs,
    /// No exports at all, and falling back to CommonJS semantics.
    EmptyCommonJs,
    /// A value that is made available as both the CommonJS `exports` and the ESM default export.
    Value,
    /// Some error occurred while determining exports.
    Unknown,
    /// No exports, used by custom module types.
    None,
}

#[turbo_tasks::value_impl]
impl EcmascriptExports {
    #[turbo_tasks::function]
    pub async fn split_locals_and_reexports(&self) -> Result<Vc<bool>> {
        Ok(match self {
            EcmascriptExports::EsmExports(exports) => {
                let exports = exports.await?;
                let has_reexports = !exports.star_exports.is_empty()
                    || exports.exports.iter().any(|(_, export)| {
                        matches!(
                            export,
                            EsmExport::ImportedBinding(..) | EsmExport::ImportedNamespace(_)
                        )
                    });
                Vc::cell(has_reexports)
            }
            _ => Vc::cell(false),
        })
    }
}
