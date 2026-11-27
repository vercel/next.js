use anyhow::Result;
use bincode::{Decode, Encode};
use swc_core::{
    ecma::{
        ast::{KeyValueProp, Prop, PropName},
        visit::fields::PropField,
    },
    quote,
};
use turbo_tasks::{NonLocalValue, Vc, debug::ValueDebugFormat};
use turbo_tasks_fs::FileSystemPath;
use turbopack_core::chunk::ChunkingContext;

use crate::{
    ast_path_trie::{AstPathId, AstPathTrie},
    code_gen::{CodeGen, CodeGeneration},
    create_visitor,
    references::as_abs_path,
    runtime_functions::TURBOPACK_RESOLVE_ABSOLUTE_PATH,
};

/// Replaces `__dirname` / `__filename` with the path of the module's source file.
///
/// When the output runs in Node.js, the path is resolved at runtime (relative to the location of
/// the output), so that it points to the real location of the source file, like `import.meta.url`
/// does. Files that are statically referenced relative to that path (e.g.
/// `fs.readFileSync(path.join(__dirname, "data.bin"))`) are traced and exist at that location.
///
/// Otherwise, or when the source file is not in the root filesystem, the placeholder
/// `/ROOT/<path>` is inlined instead (see [`as_abs_path`]).
#[derive(Clone, Debug, PartialEq, Eq, Hash, ValueDebugFormat, NonLocalValue, Encode, Decode)]
pub struct InputRelativeCodeGen {
    /// The path of the source file (`__filename`) or its directory (`__dirname`).
    value: FileSystemPath,
    path: AstPathId,
}

impl InputRelativeCodeGen {
    pub fn new(value: FileSystemPath, path: AstPathId) -> Self {
        InputRelativeCodeGen { value, path }
    }

    pub async fn code_generation(
        &self,
        trie: &AstPathTrie,
        chunking_context: Vc<Box<dyn ChunkingContext>>,
    ) -> Result<CodeGeneration> {
        let path = &self.value;

        let runtime_relative_path = if *chunking_context.environment().node_externals().await? {
            let root_path = chunking_context.root_path().await?;
            if path.fs == root_path.fs {
                root_path.get_relative_path_to(path)
            } else {
                None
            }
        } else {
            None
        };

        let value = if let Some(relative_path) = runtime_relative_path {
            let relative_path = relative_path.trim_start_matches("./");
            quote!(
                "$turbopack_resolve_absolute_path($path)" as Expr,
                turbopack_resolve_absolute_path: Expr = TURBOPACK_RESOLVE_ABSOLUTE_PATH.into(),
                path: Expr = relative_path.into(),
            )
        } else {
            quote!(
                "(\"TURBOPACK compile-time value\", $e)" as Expr,
                e: Expr = as_abs_path(path.clone()).into(),
            )
        };

        let visitor = if matches!(
            trie.get(self.path),
            Some(swc_core::ecma::visit::AstParentKind::Prop(
                PropField::Shorthand
            ))
        ) {
            // `{ __dirname }`
            let ast_path = trie.parent_or_root(self.path);
            create_visitor!(exact, trie, ast_path, visit_mut_prop, |prop: &mut Prop| {
                if let Prop::Shorthand(ident) = prop {
                    *prop = Prop::KeyValue(KeyValueProp {
                        key: PropName::Ident(ident.clone().into()),
                        value: value.clone().into(),
                    });
                }
            })
        } else {
            create_visitor!(trie, self.path, visit_mut_expr, |expr: &mut Expr| {
                *expr = value.clone();
            })
        };

        Ok(CodeGeneration::visitors(vec![visitor]))
    }
}

impl From<InputRelativeCodeGen> for CodeGen {
    fn from(val: InputRelativeCodeGen) -> Self {
        CodeGen::InputRelativeCodeGen(val)
    }
}
