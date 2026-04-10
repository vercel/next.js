use anyhow::Result;
use turbo_rcstr::{RcStr, rcstr};
use turbo_tasks::{ResolvedVc, ValueToString, Vc, turbofmt};
use turbo_tasks_fs::FileSystemPath;
use turbopack_core::{
    chunk::ChunkingType,
    issue::{Issue, IssueExt, IssueSeverity, IssueStage, OptionStyledString, StyledString},
    reference::ModuleReference,
    reference_type::CssReferenceSubType,
    resolve::{ModuleResolveResult, origin::ResolveOrigin, parse::Request},
};

use crate::{module_asset::EcmascriptCssModule, references::css_resolve};

/// A `composes: ... from ...` CSS module reference.
#[turbo_tasks::value]
#[derive(Hash, Debug, ValueToString)]
#[value_to_string("compose(url) {request}")]
pub struct CssModuleComposeReference {
    pub origin: ResolvedVc<Box<dyn ResolveOrigin>>,
    pub request: ResolvedVc<Request>,
}

#[turbo_tasks::value_impl]
impl CssModuleComposeReference {
    /// Creates a new [`CssModuleComposeReference`].
    #[turbo_tasks::function]
    pub fn new(
        origin: ResolvedVc<Box<dyn ResolveOrigin>>,
        request: ResolvedVc<Request>,
    ) -> Vc<Self> {
        Self::cell(CssModuleComposeReference { origin, request })
    }
}

#[turbo_tasks::value_impl]
impl ModuleReference for CssModuleComposeReference {
    #[turbo_tasks::function]
    async fn resolve_reference(&self) -> Result<Vc<ModuleResolveResult>> {
        let result = css_resolve(
            *self.origin,
            *self.request,
            CssReferenceSubType::Compose,
            // TODO: add real issue source, currently impossible
            None,
        );

        let resolved = result.first_module().await?;
        let file_path = self.origin.origin_path().to_resolved().await?;
        if let Some(module) = &*resolved {
            if ResolvedVc::try_downcast_type::<EcmascriptCssModule>(*module).is_none() {
                CssModuleComposesIssue {
                    severity: IssueSeverity::Error,
                    file_path,
                    // TODO(PACK-4879): this should include detailed location information
                    message: turbofmt!(
                        "Module {} referenced in `composes: ... from ...;` is not a CSS module.\n",
                        self.request
                    )
                    .await?,
                }
                .resolved_cell()
                .emit();
            }
        } else {
            CssModuleComposesIssue {
                severity: IssueSeverity::Error,
                file_path,
                // TODO(PACK-4879): this should include detailed location information
                message: turbofmt!(
                    "Module {} referenced in `composes: ... from ...;` can't be resolved.\n",
                    self.request
                )
                .await?,
            }
            .resolved_cell()
            .emit();
        }

        Ok(result)
    }

    fn chunking_type(&self) -> Option<ChunkingType> {
        Some(ChunkingType::Parallel {
            inherit_async: false,
            hoisted: false,
        })
    }
}

#[turbo_tasks::value(shared)]
struct CssModuleComposesIssue {
    severity: IssueSeverity,
    file_path: ResolvedVc<FileSystemPath>,
    message: RcStr,
}

#[turbo_tasks::value_impl]
impl Issue for CssModuleComposesIssue {
    fn severity(&self) -> IssueSeverity {
        self.severity
    }

    #[turbo_tasks::function]
    fn title(&self) -> Vc<StyledString> {
        StyledString::Text(rcstr!(
            "An issue occurred while resolving a CSS module `composes:` rule"
        ))
        .cell()
    }

    #[turbo_tasks::function]
    fn stage(&self) -> Vc<IssueStage> {
        IssueStage::Resolve.cell()
    }

    #[turbo_tasks::function]
    fn file_path(&self) -> Vc<FileSystemPath> {
        *self.file_path
    }

    #[turbo_tasks::function]
    fn description(&self) -> Vc<OptionStyledString> {
        Vc::cell(Some(
            StyledString::Text(self.message.clone()).resolved_cell(),
        ))
    }
}
