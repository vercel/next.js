use anyhow::Result;
use bincode::{Decode, Encode};
use swc_core::{
    common::util::take::Take,
    ecma::ast::{Expr, ExprOrSpread, NewExpr},
    quote,
};
use turbo_tasks::{NonLocalValue, ResolvedVc, ValueToString, Vc, debug::ValueDebugFormat};
use turbopack_core::{
    chunk::{ChunkingContext, ChunkingType},
    environment::Rendering,
    issue::IssueSource,
    reference::ModuleReference,
    reference_type::{ReferenceType, UrlReferenceSubType},
    resolve::{
        ModuleResolveResult, ResolveErrorMode, origin::ResolveOrigin, parse::Request, url_resolve,
    },
};

use crate::{
    ast_path_trie::{AstPathId, AstPathTrie, AstPathTrieBuilder},
    code_gen::{CodeGen, CodeGeneration, IntoCodeGenReference},
    create_visitor,
    references::pattern_mapping::{PatternMapping, ResolveType, UrlModuleMode},
    runtime_functions::TURBOPACK_RELATIVE_URL,
};

/// Determines how to treat `new URL(...)` rewrites.
/// This allows to construct url depends on the different building context,
/// e.g. SSR, CSR, or Node.js.
#[turbo_tasks::task_input]
#[derive(Copy, Clone, Debug, Eq, PartialEq, Hash, Encode, Decode)]
pub enum UrlRewriteBehavior {
    /// Omits base, resulting in a relative URL.
    Relative,
    /// Uses the full URL, including the base.
    Full,
    /// Do not attempt to rewrite the URL.
    None,
}

/// URL Asset References are injected during code analysis when we find a
/// (statically analyzable) `new URL("path", import.meta.url)`.
///
/// It's responsible rewriting the `URL` constructor's arguments to allow the
/// referenced file to be imported/fetched/etc.
#[turbo_tasks::value]
#[derive(ValueToString)]
#[value_to_string("new URL({request})")]
pub struct UrlAssetReference {
    origin: ResolvedVc<Box<dyn ResolveOrigin>>,
    request: ResolvedVc<Request>,
    rendering: Rendering,
    issue_source: IssueSource,
    error_mode: ResolveErrorMode,
    url_rewrite_behavior: UrlRewriteBehavior,
}

impl UrlAssetReference {
    pub fn new(
        origin: ResolvedVc<Box<dyn ResolveOrigin>>,
        request: ResolvedVc<Request>,
        rendering: Rendering,
        issue_source: IssueSource,
        error_mode: ResolveErrorMode,
        url_rewrite_behavior: UrlRewriteBehavior,
    ) -> Self {
        UrlAssetReference {
            origin,
            request,
            rendering,
            issue_source,
            error_mode,
            url_rewrite_behavior,
        }
    }
}

#[turbo_tasks::value_impl]
impl ModuleReference for UrlAssetReference {
    #[turbo_tasks::function]
    fn resolve_reference(&self) -> Vc<ModuleResolveResult> {
        url_resolve(
            *self.origin,
            *self.request,
            ReferenceType::Url(UrlReferenceSubType::EcmaScriptNewUrl),
            Some(self.issue_source),
            self.error_mode,
        )
    }

    fn chunking_type(&self) -> Option<ChunkingType> {
        Some(ChunkingType::Parallel {
            inherit_async: false,
            hoisted: false,
        })
    }

    fn source(&self) -> Option<IssueSource> {
        Some(self.issue_source)
    }
}

impl IntoCodeGenReference for UrlAssetReference {
    fn into_reference(self) -> ResolvedVc<Box<dyn ModuleReference>> {
        ResolvedVc::upcast(self.resolved_cell())
    }

    fn into_code_gen_reference(
        self,
        _trie: &AstPathTrieBuilder,
        path: AstPathId,
    ) -> (ResolvedVc<Box<dyn ModuleReference>>, CodeGen) {
        let reference = self.resolved_cell();
        (
            ResolvedVc::upcast(reference),
            CodeGen::UrlAssetReferenceCodeGen(UrlAssetReferenceCodeGen { reference, path }),
        )
    }
}

#[derive(PartialEq, Eq, ValueDebugFormat, NonLocalValue, Hash, Debug, Encode, Decode)]
pub struct UrlAssetReferenceCodeGen {
    reference: ResolvedVc<UrlAssetReference>,
    path: AstPathId,
}

impl UrlAssetReferenceCodeGen {
    /// Rewrites call to the `new URL()` ctor depends on the current
    /// conditions. Generated code will point to the output path of the asset,
    /// as similar to the webpack's behavior. This is based on the
    /// configuration (UrlRewriteBehavior), and the current context
    /// (rendering). The URL of the referenced asset (`<url>`) is created by
    /// [`PatternMapping::create_url`]: for a request with a single result it's
    /// a constant expression, otherwise (e.g. `new URL(`./${name}`, import.meta.url)`)
    /// the asset is looked up at runtime from a request -> URL map. The
    /// following table shows the behavior:
    /*
     * original call: `new URL(url, base);`
    ┌───────────────────────────────┬──────────────────────────────────────┐
    │  UrlRewriteBehavior           │ Rewritten call                       │
    ├───────────────────────────────┼──────────────────────────────────────┤
    │ Relative                      │ new __turbopack_relative_url__(<url>) │
    │ Full(RenderingClient::Client) │ new URL(<url>, location.origin)      │
    │ Full(RenderingClient::..)     │ new URL(<url>, base)                 │
    │ None                          │ new URL(url, base)                   │
    └───────────────────────────────┴──────────────────────────────────────┘
    */
    /// For modules, `<url>` is `__turbopack_require__(id)` (which exports the
    /// asset path), except for `Full` in non-client rendering, where it is
    /// `__turbopack_resolve_module_id_path__(id)` (the absolute path, which
    /// makes the base irrelevant). URL externals evaluate to their request.
    ///
    /// A request without any constant parts (e.g. `new URL(variable,
    /// import.meta.url)`) is left untouched.
    pub async fn code_generation(
        &self,
        trie: &AstPathTrie,
        chunking_context: Vc<Box<dyn ChunkingContext>>,
    ) -> Result<CodeGeneration> {
        let reference = self.reference.await?;

        if reference.url_rewrite_behavior == UrlRewriteBehavior::None
            || !reference
                .request
                .request_pattern()
                .await?
                .has_constant_parts()
        {
            return Ok(CodeGeneration::empty());
        }

        let pattern_mapping = PatternMapping::resolve_request(
            *reference.request,
            *reference.origin,
            chunking_context,
            self.reference.resolve_reference(),
            ResolveType::ChunkItem,
            Some(Vc::upcast(*self.reference)),
        )
        .await?;

        // For rendering environments (CSR), we rewrite the `import.meta.url` to
        // be a location.origin because it allows us to access files from the root of
        // the dev server.
        //
        // By default for the remaining environments, turbopack's runtime have overridden
        // `import.meta.url`.
        let rewrite_url_base = match (reference.url_rewrite_behavior, reference.rendering) {
            (UrlRewriteBehavior::Full, Rendering::Client) => {
                Some(quote!("location.origin" as Expr))
            }
            _ => None,
        };
        let module_mode = match (reference.url_rewrite_behavior, reference.rendering) {
            (UrlRewriteBehavior::Full, Rendering::None | Rendering::Server) => {
                UrlModuleMode::ResolveModuleIdPath
            }
            _ => UrlModuleMode::Require,
        };
        let relative = reference.url_rewrite_behavior == UrlRewriteBehavior::Relative;
        // Keys of a relative request (`./…`) match the runtime request, other requests (e.g. a
        // bare `assets/…`) are resolved relatively and need aliases without the leading `./`.
        let bare_aliases = !matches!(&*reference.request.await?, Request::Relative { .. });

        let visitor = create_visitor!(trie, self.path, visit_mut_expr, |new_expr: &mut Expr| {
            let Expr::New(NewExpr {
                args: Some(args), ..
            }) = new_expr
            else {
                return;
            };
            let Some(ExprOrSpread { expr, spread: None }) = args.get_mut(0) else {
                return;
            };
            let url = pattern_mapping.create_url(*expr.take(), module_mode, bare_aliases);
            if relative {
                *new_expr = quote!(
                    "new $turbopack_relative_url($url)" as Expr,
                    turbopack_relative_url: Expr = TURBOPACK_RELATIVE_URL.into(),
                    url: Expr = url,
                );
                return;
            }
            **expr = url;
            if let Some(rewrite) = &rewrite_url_base
                && let Some(ExprOrSpread { expr, spread: None }) = args.get_mut(1)
            {
                **expr = rewrite.clone();
            }
        });

        Ok(CodeGeneration::visitors(vec![visitor]))
    }
}
