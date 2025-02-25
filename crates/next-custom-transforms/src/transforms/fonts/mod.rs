use rustc_hash::{FxHashMap, FxHashSet};
use serde::Deserialize;
use swc_core::{
    common::{BytePos, Spanned},
    ecma::{
        ast::{Id, ModuleItem, Pass},
        atoms::JsWord,
        visit::{noop_visit_mut_type, visit_mut_pass, VisitMut, VisitWith},
    },
};

mod find_functions_outside_module_scope;
mod font_functions_collector;
mod font_imports_generator;

#[derive(Clone, Debug, Deserialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
pub struct Config {
    pub font_loaders: Vec<JsWord>,
    pub relative_file_path_from_root: JsWord,
}

pub fn next_font_loaders(config: Config) -> impl Pass + VisitMut {
    visit_mut_pass(NextFontLoaders {
        config,
        state: State {
            ..Default::default()
        },
    })
}

#[derive(Debug)]
pub struct FontFunction {
    loader: JsWord,
    function_name: Option<JsWord>,
}
#[derive(Debug, Default)]
pub struct State {
    font_functions: FxHashMap<Id, FontFunction>,
    removeable_module_items: FxHashSet<BytePos>,
    font_imports: Vec<ModuleItem>,
    font_exports: Vec<ModuleItem>,
    font_functions_in_allowed_scope: FxHashSet<BytePos>,
}

struct NextFontLoaders {
    config: Config,
    state: State,
}

impl VisitMut for NextFontLoaders {
    noop_visit_mut_type!();

    fn visit_mut_module_items(&mut self, items: &mut Vec<ModuleItem>) {
        // Find imported functions from font loaders
        let mut functions_collector = font_functions_collector::FontFunctionsCollector {
            font_loaders: &self.config.font_loaders,
            state: &mut self.state,
        };
        items.visit_with(&mut functions_collector);

        if !self.state.removeable_module_items.is_empty() {
            // Generate imports from font function calls
            let mut import_generator = font_imports_generator::FontImportsGenerator {
                state: &mut self.state,
                relative_path: &self.config.relative_file_path_from_root,
            };
            items.visit_with(&mut import_generator);

            // Find font function refs in wrong scope
            let mut wrong_scope =
                find_functions_outside_module_scope::FindFunctionsOutsideModuleScope {
                    state: &self.state,
                };
            items.visit_with(&mut wrong_scope);

            fn is_removable(ctx: &NextFontLoaders, item: &ModuleItem) -> bool {
                ctx.state.removeable_module_items.contains(&item.span_lo())
            }

            let first_removable_index = items
                .iter()
                .position(|item| is_removable(self, item))
                .unwrap();

            // Remove marked module items
            items.retain(|item| !is_removable(self, item));

            // Add font imports and exports
            items.splice(
                first_removable_index..first_removable_index,
                std::mem::take(&mut self.state.font_imports),
            );
            items.append(&mut self.state.font_exports);
        }
    }
}
