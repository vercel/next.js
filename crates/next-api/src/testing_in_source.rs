//! In-source syntax is an explicit native test-entry transform. User source
//! bytes, module identity, exports and source positions stay compiler-owned.

use anyhow::{Context, Result, bail};
use async_trait::async_trait;
use swc_core::{
    common::{DUMMY_SP, Spanned},
    ecma::{
        ast::*,
        visit::{VisitMut, VisitMutWith},
    },
};
use turbo_tasks::{ResolvedVc, Vc};
use turbo_tasks_fs::{File, FileContent, FileSystemPath};
use turbo_tasks_hash::HashAlgorithm;
use turbopack::module_options::{
    ModuleOptionsContext, ModuleRule, ModuleRuleEffect, RuleCondition,
};
use turbopack_core::{
    asset::{Asset, AssetContent, no_hash_salt},
    file_source::FileSource,
    virtual_output::VirtualOutputAsset,
};
use turbopack_ecmascript::{
    CustomTransformer, EcmascriptInputTransform, EcmascriptInputTransforms, TransformContext,
    TransformPlugin,
};

#[turbo_tasks::function]
fn transform_plugin() -> Vc<TransformPlugin> {
    Vc::cell(Box::new(InSourceTest) as Box<dyn CustomTransformer + Send + Sync>)
}

#[turbo_tasks::function]
pub(crate) async fn module_options(
    options: Vc<ModuleOptionsContext>,
    path: FileSystemPath,
) -> Result<Vc<ModuleOptionsContext>> {
    let mut options = options.owned().await?;
    options.module_rules.push(ModuleRule::new_all(
        RuleCondition::ResourcePathEquals(path.clone()),
        vec![ModuleRuleEffect::ExtendEcmascriptTransforms {
            preprocess: ResolvedVc::<EcmascriptInputTransforms>::cell(vec![]),
            main: ResolvedVc::<EcmascriptInputTransforms>::cell(vec![
                EcmascriptInputTransform::Plugin(transform_plugin().to_resolved().await?),
            ]),
            postprocess: ResolvedVc::<EcmascriptInputTransforms>::cell(vec![]),
        }],
    ));
    for (_, nested) in &mut options.rules {
        *nested = module_options(**nested, path.clone()).to_resolved().await?;
    }
    Ok(options.cell())
}

/// The source and emitted code participate in the same strongly consistent
/// native output snapshot. This binds discovery to the compiler's FileSource
/// rather than accepting only JavaScript reads before and after compilation.
pub(crate) async fn source_hash_asset(
    source_path: FileSystemPath,
    output_path: FileSystemPath,
) -> Result<ResolvedVc<VirtualOutputAsset>> {
    let hash = FileSource::new(source_path)
        .content()
        .content_hash(no_hash_salt(), HashAlgorithm::Sha256Base64)
        .owned()
        .await?
        .context("Selected in-source test file was not found")?;
    let digest = data_encoding::HEXLOWER.encode(&data_encoding::BASE64.decode(hash.as_bytes())?);
    let metadata = format!("{{\"version\":1,\"sha256\":\"{digest}\"}}");
    Ok(VirtualOutputAsset::new(
        output_path,
        AssetContent::file(FileContent::Content(File::from(metadata)).cell()),
    )
    .to_resolved()
    .await?)
}

#[derive(Debug)]
struct InSourceTest;

#[async_trait]
impl CustomTransformer for InSourceTest {
    async fn transform(&self, program: &mut Program, _ctx: &TransformContext<'_>) -> Result<()> {
        substitute(program)
    }
}

fn substitute(program: &mut Program) -> Result<()> {
    let namespace = Ident::new_private("__next_in_source_vitest__".into(), DUMMY_SP);
    let mut visitor = Substitute {
        namespace: namespace.clone(),
        replaced: false,
    };
    program.visit_mut_with(&mut visitor);
    if !visitor.replaced {
        return Ok(());
    }
    let Program::Module(module) = program else {
        bail!("import.meta.vitest requires an ECMAScript module");
    };
    let directives = module.body.iter().take_while(|item| {
        matches!(item, ModuleItem::Stmt(Stmt::Expr(statement)) if matches!(&*statement.expr, Expr::Lit(Lit::Str(_))))
    }).count();
    module.body.insert(
        directives,
        ModuleItem::ModuleDecl(ModuleDecl::Import(ImportDecl {
            span: DUMMY_SP,
            specifiers: vec![ImportSpecifier::Namespace(ImportStarAsSpecifier {
                span: DUMMY_SP,
                local: namespace,
            })],
            src: Box::new(Str {
                span: DUMMY_SP,
                value: "vitest".into(),
                raw: None,
            }),
            type_only: false,
            with: None,
            phase: ImportPhase::Evaluation,
        })),
    );
    Ok(())
}

struct Substitute {
    namespace: Ident,
    replaced: bool,
}

impl VisitMut for Substitute {
    fn visit_mut_expr(&mut self, expression: &mut Expr) {
        if let Expr::Member(member) = expression
            && matches!(&*member.obj, Expr::MetaProp(meta) if meta.kind == MetaPropKind::ImportMeta)
            && matches!(&member.prop, MemberProp::Ident(property) if property.sym == "vitest")
        {
            let mut namespace = self.namespace.clone();
            namespace.span = member.span();
            *expression = Expr::Ident(namespace);
            self.replaced = true;
            return;
        }
        expression.visit_mut_children_with(self);
    }
}

#[cfg(test)]
mod tests {
    use swc_core::{
        common::{FileName, GLOBALS, SourceMap},
        ecma::{
            ast::*,
            parser::{Syntax, parse_file_as_program},
            visit::{Visit, VisitWith},
        },
    };

    use crate::testing_in_source::substitute;

    fn parse(source: &str) -> Program {
        let map = SourceMap::default();
        let file = map.new_source_file(
            FileName::Custom("subject.source.mjs".into()).into(),
            source.to_string(),
        );
        let mut errors = vec![];
        let program = parse_file_as_program(
            &file,
            Syntax::Es(Default::default()),
            EsVersion::EsNext,
            None,
            &mut errors,
        )
        .unwrap();
        assert!(errors.is_empty());
        program
    }

    #[derive(Default)]
    struct Calls(Vec<(String, swc_core::common::Span)>);
    impl Visit for Calls {
        fn visit_call_expr(&mut self, call: &CallExpr) {
            if let Some(argument) = call.args.first()
                && let Expr::Lit(Lit::Str(name)) = &*argument.expr
            {
                self.0
                    .push((name.value.to_string_lossy().to_string(), call.span));
            }
            call.visit_children_with(self);
        }
    }

    #[test]
    fn native_substitution_retains_original_case_and_source_span() {
        GLOBALS.set(&Default::default(), || {
            let source = include_str!("../../../test/unit/app-dir/next-testing-stable-release-gaps/fixtures/in-source-tests/subject.source.mjs");
            let mut program = parse(source);
            let mut before = Calls::default(); program.visit_with(&mut before);
            substitute(&mut program).unwrap();
            let mut after = Calls::default(); program.visit_with(&mut after);
            assert_eq!(before.0, after.0);
            assert_eq!(after.0[0].0, "in-source body");
            let Program::Module(module) = program else { panic!("module expected") };
            assert!(matches!(&module.body[0], ModuleItem::ModuleDecl(ModuleDecl::Import(import)) if import.src.value.as_str() == Some("vitest") && import.specifiers.len() == 1));
            assert!(matches!(&module.body[1], ModuleItem::ModuleDecl(ModuleDecl::ExportDecl(_))));
        });
    }

    #[test]
    fn native_substitution_is_hygienic_and_preserves_directives() {
        GLOBALS.set(&Default::default(), || {
            let mut program = parse(
                "'use custom';const __next_in_source_vitest__=42;if(import.meta.vitest){const \
                 {test}=import.meta.vitest;test('own',()=>{})}",
            );
            substitute(&mut program).unwrap();
            let Program::Module(module) = program else {
                panic!("module expected")
            };
            assert!(matches!(&module.body[0], ModuleItem::Stmt(Stmt::Expr(_))));
            let ModuleItem::ModuleDecl(ModuleDecl::Import(import)) = &module.body[1] else {
                panic!("namespace import expected")
            };
            let ImportSpecifier::Namespace(namespace) = &import.specifiers[0] else {
                panic!("namespace specifier expected")
            };
            let ModuleItem::Stmt(Stmt::Decl(Decl::Var(declaration))) = &module.body[2] else {
                panic!("original variable expected")
            };
            let Pat::Ident(original) = &declaration.decls[0].name else {
                panic!("original identifier expected")
            };
            assert_ne!(namespace.local.ctxt, original.id.ctxt);
        });
    }

    #[test]
    fn ordinary_meta_properties_and_marker_strings_add_no_test_import() {
        GLOBALS.set(&Default::default(), || {
            let mut program =
                parse("export const url=import.meta.url;export const marker='import.meta.vitest';");
            let before = program.clone();
            substitute(&mut program).unwrap();
            assert_eq!(program, before);
        });
    }
}
