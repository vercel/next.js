use anyhow::Result;
use bincode::{Decode, Encode};
use swc_core::{
    atoms::atom,
    ecma::{
        ast::{Expr, KeyValueProp, MemberExpr, MemberProp, Prop, PropName, SimpleAssignTarget},
        visit::{AstParentKind, fields::PropField},
    },
    quote,
};
use turbo_rcstr::{RcStr, rcstr};
use turbo_tasks::{NonLocalValue, Vc, debug::ValueDebugFormat};
use turbopack_core::chunk::ChunkingContext;

use crate::{
    ast_path_trie::{AstPathId, AstPathTrie},
    code_gen::{CodeGen, CodeGeneration, CodeGenerationHoistedStmt},
    create_visitor,
    runtime_functions::{TURBOPACK_INIT_PUBLIC_PATH, TURBOPACK_PUBLIC_PATH},
};

#[derive(PartialEq, Eq, ValueDebugFormat, NonLocalValue, Hash, Debug, Encode, Decode)]
pub struct RuntimePublicPathReference {
    default_path: Option<RcStr>,
    path: AstPathId,
}

fn public_path_member() -> MemberExpr {
    MemberExpr {
        obj: Box::new(Expr::Ident(atom!("__turbopack_context__").into())),
        prop: MemberProp::Ident(TURBOPACK_PUBLIC_PATH.shortcut.into()),
        ..Default::default()
    }
}

impl RuntimePublicPathReference {
    pub fn new(default_path: Option<RcStr>, path: AstPathId) -> Self {
        Self { default_path, path }
    }

    pub async fn code_generation(
        &self,
        trie: &AstPathTrie,
        _chunking_context: Vc<Box<dyn ChunkingContext>>,
    ) -> Result<CodeGeneration> {
        let mut result = CodeGeneration::empty();
        if let Some(default_path) = &self.default_path {
            result.hoisted_stmts.push(CodeGenerationHoistedStmt::new(
                rcstr!("runtime public path"),
                quote!(
                    "$init($path);" as Stmt,
                    init: Expr = TURBOPACK_INIT_PUBLIC_PATH.into(),
                    path: Expr = Expr::Lit(default_path.as_str().into()),
                ),
            ));
        }
        let mut ast_path = self.path;
        loop {
            match trie.get(ast_path) {
                Some(AstParentKind::Prop(PropField::Shorthand)) => {
                    ast_path = trie.parent_or_root(ast_path);
                    result.visitors.push(create_visitor!(
                        exact,
                        trie,
                        ast_path,
                        visit_mut_prop,
                        |prop: &mut Prop| {
                            if let Prop::Shorthand(ident) = prop {
                                *prop = Prop::KeyValue(KeyValueProp {
                                    key: PropName::Ident(ident.clone().into()),
                                    value: Box::new(Expr::Member(public_path_member())),
                                });
                            }
                        }
                    ));
                    break;
                }
                Some(AstParentKind::SimpleAssignTarget(_)) => {
                    ast_path = trie.parent_or_root(ast_path);
                    result.visitors.push(create_visitor!(
                        exact,
                        trie,
                        ast_path,
                        visit_mut_simple_assign_target,
                        |target: &mut SimpleAssignTarget| {
                            *target = SimpleAssignTarget::Member(public_path_member());
                        }
                    ));
                    break;
                }
                Some(AstParentKind::Expr(_)) => {
                    ast_path = trie.parent_or_root(ast_path);
                    result.visitors.push(create_visitor!(
                        exact,
                        trie,
                        ast_path,
                        visit_mut_expr,
                        |expr: &mut Expr| {
                            *expr = Expr::Member(public_path_member());
                        }
                    ));
                    break;
                }
                Some(_) => ast_path = trie.parent_or_root(ast_path),
                None => break,
            }
        }
        Ok(result)
    }
}

impl From<RuntimePublicPathReference> for CodeGen {
    fn from(value: RuntimePublicPathReference) -> Self {
        Self::RuntimePublicPathReference(value)
    }
}
