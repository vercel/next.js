use anyhow::Result;
use turbo_tasks::{ResolvedVc, TryFlatJoinIterExt, Vc};
use turbo_tasks_fs::{glob::Glob, FileJsonContent, FileSystemPath};
use turbopack_core::{
    asset::Asset,
    chunk::ChunkableModule,
    error::PrettyPrintError,
    issue::{Issue, IssueExt, IssueSeverity, IssueStage, OptionStyledString, StyledString},
    module::Module,
    resolve::{find_context_file, package_json, FindContextFileResult},
};

use crate::references::{
    async_module::OptionAsyncModule,
    esm::{EsmExport, EsmExports},
};

#[turbo_tasks::value_trait]
pub trait EcmascriptChunkPlaceable: ChunkableModule + Module + Asset {
    fn get_exports(self: Vc<Self>) -> Vc<EcmascriptExports>;
    fn get_async_module(self: Vc<Self>) -> Vc<OptionAsyncModule> {
        Vc::cell(None)
    }
    fn is_marked_as_side_effect_free(
        self: Vc<Self>,
        side_effect_free_packages: Vc<Glob>,
    ) -> Vc<bool> {
        is_marked_as_side_effect_free(self.ident().path(), side_effect_free_packages)
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
    package_json: ResolvedVc<FileSystemPath>,
) -> Result<Vc<SideEffectsValue>> {
    if let FileJsonContent::Content(content) = &*package_json.read_json().await? {
        if let Some(side_effects) = content.get("sideEffects") {
            if let Some(side_effects) = side_effects.as_bool() {
                return Ok(SideEffectsValue::Constant(side_effects).cell());
            } else if let Some(side_effects) = side_effects.as_array() {
                let globs = side_effects
                    .iter()
                    .filter_map(|side_effect| {
                        if let Some(side_effect) = side_effect.as_str() {
                            if side_effect.contains('/') {
                                Some(Glob::new(side_effect.into()))
                            } else {
                                Some(Glob::new(format!("**/{side_effect}").into()))
                            }
                        } else {
                            SideEffectsInPackageJsonIssue {
                                path: package_json,
                                description: Some(
                                    StyledString::Text(
                                        format!(
                                            "Each element in sideEffects must be a string, but \
                                             found {:?}",
                                            side_effect
                                        )
                                        .into(),
                                    )
                                    .resolved_cell(),
                                ),
                            }
                            .cell()
                            .emit();
                            None
                        }
                    })
                    .map(|glob| async move {
                        match glob.resolve().await {
                            Ok(glob) => Ok(Some(glob)),
                            Err(err) => {
                                SideEffectsInPackageJsonIssue {
                                    path: package_json,
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
                                .cell()
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
                    path: package_json,
                    description: Some(
                        StyledString::Text(
                            format!(
                                "sideEffects must be a boolean or an array, but found {:?}",
                                side_effects
                            )
                            .into(),
                        )
                        .resolved_cell(),
                    ),
                }
                .cell()
                .emit();
            }
        }
    }
    Ok(SideEffectsValue::None.cell())
}

#[turbo_tasks::value]
struct SideEffectsInPackageJsonIssue {
    path: ResolvedVc<FileSystemPath>,
    description: Option<ResolvedVc<StyledString>>,
}

#[turbo_tasks::value_impl]
impl Issue for SideEffectsInPackageJsonIssue {
    #[turbo_tasks::function]
    fn stage(&self) -> Vc<IssueStage> {
        IssueStage::Parse.into()
    }

    #[turbo_tasks::function]
    fn severity(&self) -> Vc<IssueSeverity> {
        IssueSeverity::Warning.cell()
    }

    #[turbo_tasks::function]
    fn file_path(&self) -> Vc<FileSystemPath> {
        *self.path
    }

    #[turbo_tasks::function]
    fn title(&self) -> Vc<StyledString> {
        StyledString::Text("Invalid value for sideEffects in package.json".into()).cell()
    }

    #[turbo_tasks::function]
    fn description(&self) -> Vc<OptionStyledString> {
        Vc::cell(self.description)
    }
}

#[turbo_tasks::function]
pub async fn is_marked_as_side_effect_free(
    path: Vc<FileSystemPath>,
    side_effect_free_packages: Vc<Glob>,
) -> Result<Vc<bool>> {
    if side_effect_free_packages.await?.execute(&path.await?.path) {
        return Ok(Vc::cell(true));
    }

    let find_package_json = find_context_file(path.parent(), package_json()).await?;

    if let FindContextFileResult::Found(package_json, _) = *find_package_json {
        match *side_effects_from_package_json(*package_json).await? {
            SideEffectsValue::None => {}
            SideEffectsValue::Constant(side_effects) => return Ok(Vc::cell(!side_effects)),
            SideEffectsValue::Glob(glob) => {
                if let Some(rel_path) = package_json
                    .parent()
                    .await?
                    .get_relative_path_to(&*path.await?)
                {
                    return Ok(Vc::cell(!glob.await?.execute(&rel_path)));
                }
            }
        }
    }

    Ok(Vc::cell(false))
}

#[turbo_tasks::value(shared)]
pub enum EcmascriptExports {
    EsmExports(ResolvedVc<EsmExports>),
    DynamicNamespace,
    CommonJs,
    EmptyCommonJs,
    Value,
    None,
}

#[turbo_tasks::value_impl]
impl EcmascriptExports {
    #[turbo_tasks::function]
    pub async fn needs_facade(&self) -> Result<Vc<bool>> {
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
