use std::{
    env::{self, current_dir},
    fs::read_dir,
    path::{MAIN_SEPARATOR as PATH_SEP, PathBuf},
    sync::Arc,
};

use anyhow::{Context, Result};
use glob::glob;
use quote::ToTokens;
use rustc_hash::{FxHashMap, FxHashSet};
use syn::{
    Attribute, Expr, Ident, Item, ItemEnum, ItemImpl, ItemMacro, ItemMod, ItemStruct, Lit, Meta,
    parse_quote,
};
use turbo_tasks_macros_shared::{GenericTypeInput, PrimitiveInput, get_path_ident, get_type_ident};

pub fn generate_register() {
    println!("cargo:rerun-if-changed=build.rs");

    let crate_dir = current_dir().unwrap();
    let workspace_dir = env::var_os("CARGO_WORKSPACE_DIR")
        .map(PathBuf::from)
        .unwrap_or_else(|| crate_dir.clone());
    let out_dir = PathBuf::from(env::var("OUT_DIR").unwrap());

    let src_dir = crate_dir.join("src");
    let examples_dir = crate_dir.join("examples");
    let tests_dir = crate_dir.join("tests");
    let fuzz_dir = crate_dir.join("fuzz_targets");
    let afl_dir = crate_dir.join("afl_targets");
    let benches_dir = crate_dir.join("benches");
    let cargo_lock_path = workspace_dir.join("Cargo.lock");

    // TODO: use (ask @sokra)
    let _lock = cargo_lock::Lockfile::load(cargo_lock_path).ok();

    let mut entries = Vec::new();

    let lib_entry = src_dir.join("lib.rs");
    if lib_entry.exists() {
        entries.push(("register.rs".to_string(), lib_entry));
    } else {
        let bin_entry = src_dir.join("main.rs");
        if bin_entry.exists() {
            entries.push(("register.rs".to_string(), bin_entry));
        }
    }

    if examples_dir.exists() {
        for item in read_dir(examples_dir).unwrap() {
            let item = item.unwrap();
            let file_type = &item.file_type().unwrap();
            if file_type.is_file() || file_type.is_symlink() {
                let name = item.file_name();
                let name = name.to_string_lossy();
                if name.ends_with(".rs") {
                    entries.push((format!("register_example_{name}"), item.path()));
                }
            }
        }
    }

    if tests_dir.exists() {
        for item in read_dir(tests_dir).unwrap() {
            let item = item.unwrap();
            let file_type = &item.file_type().unwrap();
            if file_type.is_file() || file_type.is_symlink() {
                let name = item.file_name();
                let name = name.to_string_lossy();
                if name.ends_with(".rs") {
                    entries.push((format!("register_test_{name}"), item.path()));
                }
            }
        }
    }

    if afl_dir.exists() {
        for item in read_dir(afl_dir).unwrap() {
            let item = item.unwrap();
            let file_type = &item.file_type().unwrap();
            if file_type.is_file() || file_type.is_symlink() {
                let name = item.file_name();
                let name = name.to_string_lossy();
                if name.ends_with(".rs") {
                    entries.push((format!("register_afl_{name}"), item.path()));
                }
            }
        }
    }

    if fuzz_dir.exists() {
        for item in read_dir(fuzz_dir).unwrap() {
            let item = item.unwrap();
            let file_type = &item.file_type().unwrap();
            if file_type.is_file() || file_type.is_symlink() {
                let name = item.file_name();
                let name = name.to_string_lossy();
                if name.ends_with(".rs") {
                    entries.push((format!("register_fuzz_{name}"), item.path()));
                }
            }
        }
    }

    if benches_dir.exists() {
        let bench_mod = benches_dir.join("mod.rs");
        if bench_mod.is_file() || bench_mod.is_symlink() {
            let name = bench_mod.file_name().unwrap();
            let name = name.to_string_lossy();
            if name.ends_with(".rs") {
                entries.push(("register_benches.rs".to_string(), bench_mod));
            }
        }
    }

    for (filename, entry) in entries {
        let mut values = FxHashMap::default();

        let out_file = out_dir.join(filename);

        let mut queue = vec![QueueEntry {
            file_path: entry,
            mod_path: "".to_string(),
            attributes: Vec::new(),
        }];

        while let Some(QueueEntry {
            file_path,
            mod_path,
            attributes,
        }) = queue.pop()
        {
            println!("cargo:rerun-if-changed={}", file_path.to_string_lossy());
            let src = std::fs::read_to_string(&file_path).unwrap();

            let mut ctx = RegisterContext {
                queue: &mut queue,
                file_path: &file_path,
                mod_path,
                attributes,
                values: &mut values,
            };

            match syn::parse_file(&src)
                .with_context(|| format!("failed to parse {}", file_path.display()))
            {
                Ok(file) => {
                    for item in file.items {
                        ctx.process_item(&item).unwrap();
                    }
                }
                Err(err) => println!("{err}"),
            }
        }

        let code = "{\nstatic ONCE: std::sync::Once = std::sync::Once::new();\nONCE.call_once(|| \
                    {\n    // dead code to be deleted\n});\n}\n";

        std::fs::write(out_file, code).unwrap();

        // println!("cargo:warning={}", out_file.display());
        // for line in code.lines() {
        //     println!("cargo:warning={line}");
        // }
    }
}

pub fn rerun_if_glob(globs: &str, root: &str) {
    let cwd = env::current_dir().unwrap();
    let globs = cwd.join(globs.replace('/', PATH_SEP.to_string().as_str()));
    let root = cwd.join(root.replace('/', PATH_SEP.to_string().as_str()));
    println!("cargo:rerun-if-changed={}", root.display());
    let mut seen = FxHashSet::from_iter([root]);
    for entry in glob(globs.to_str().unwrap()).unwrap() {
        let path = entry.unwrap();
        for ancestor in path.ancestors() {
            if seen.insert(ancestor.to_owned()) {
                println!("cargo:rerun-if-changed={}", ancestor.display());
            } else {
                break;
            }
        }
    }
}

/// (mod_path, type_ident)
type ValueKey = (String, Ident);
/// (global_name, trait_register_fns)
struct ValueEntry {
    trait_idents: Vec<Ident>,
}

struct QueueEntry {
    /// The on-disk path to the file representing this module.
    file_path: PathBuf,
    /// The `syn::Path`-style representation of the module. Each component is
    /// separated by `::`.
    mod_path: String,
    /// Attributes (`#[cfg(...)]`) applied to the `ItemMod`.
    attributes: Vec<Arc<String>>,
}

struct RegisterContext<'a> {
    queue: &'a mut Vec<QueueEntry>,

    file_path: &'a PathBuf,
    mod_path: String,
    attributes: Vec<Arc<String>>,

    values: &'a mut FxHashMap<ValueKey, ValueEntry>,
}

impl RegisterContext<'_> {
    fn process_item(&mut self, item: &Item) -> Result<()> {
        match item {
            Item::Enum(enum_item) => self.process_enum(enum_item),
            Item::Impl(impl_item) => self.process_impl(impl_item),
            Item::Mod(mod_item) => self.process_mod(mod_item),
            Item::Struct(struct_item) => self.process_struct(struct_item),
            Item::Macro(macro_item) => self.process_macro(macro_item),
            _ => Ok(()),
        }
    }

    fn process_enum(&mut self, item: &ItemEnum) -> Result<()> {
        self.with_cfg_attrs(&item.attrs, move |this| this.process_enum_inner(item))
    }

    fn process_enum_inner(&mut self, enum_item: &ItemEnum) -> Result<()> {
        if has_turbo_attribute(&enum_item.attrs, "value") {
            self.add_value(&enum_item.ident);
            self.add_value_debug_impl(&enum_item.ident);
        }
        Ok(())
    }

    fn process_impl(&mut self, item: &ItemImpl) -> Result<()> {
        self.with_cfg_attrs(&item.attrs, move |this| this.process_impl_inner(item))
    }

    fn process_impl_inner(&mut self, impl_item: &ItemImpl) -> Result<()> {
        if has_turbo_attribute(&impl_item.attrs, "value_impl") {
            let struct_ident = get_type_ident(&impl_item.self_ty).unwrap();

            let trait_ident = impl_item
                .trait_
                .as_ref()
                .map(|(_, trait_path, _)| get_path_ident(trait_path));

            if let Some(trait_ident) = &trait_ident {
                self.add_value_trait(&struct_ident, trait_ident);
            }
        }
        Ok(())
    }

    fn process_mod(&mut self, item: &ItemMod) -> Result<()> {
        self.with_cfg_attrs(&item.attrs, move |this| this.process_mod_inner(item))
    }

    fn process_mod_inner(&mut self, mod_item: &ItemMod) -> Result<()> {
        let child_mod_name = mod_item.ident.to_string();
        let child_mod_path = format!("{}::{}", self.mod_path, child_mod_name);
        if let Some((_, items)) = &mod_item.content {
            let parent_mod_path = std::mem::replace(&mut self.mod_path, child_mod_path);
            for item in items {
                self.process_item(item)?;
            }
            self.mod_path = parent_mod_path;
        } else {
            let parent_file_path = self.file_path.parent().unwrap();
            if let Some(path) = mod_item.attrs.iter().find_map(|attr| {
                let Meta::NameValue(pair) = &attr.meta else {
                    return None;
                };
                if !pair.path.is_ident("path") {
                    return None;
                }
                let Expr::Lit(lit) = &pair.value else {
                    return None;
                };
                let Lit::Str(str) = &lit.lit else {
                    return None;
                };
                let path = str.value();
                let path = path.replace('/', &format!("{PATH_SEP}"));
                let path = parent_file_path.join(path);
                Some(path)
            }) {
                self.queue.push(QueueEntry {
                    file_path: path,
                    mod_path: child_mod_path,
                    attributes: self.attributes.clone(),
                });
            } else {
                let direct = parent_file_path.join(format!("{child_mod_name}.rs"));
                if direct.exists() {
                    self.queue.push(QueueEntry {
                        file_path: direct,
                        mod_path: child_mod_path,
                        attributes: self.attributes.clone(),
                    });
                } else {
                    let nested = parent_file_path.join(&child_mod_name).join("mod.rs");
                    if nested.exists() {
                        self.queue.push(QueueEntry {
                            file_path: nested,
                            mod_path: child_mod_path,
                            attributes: self.attributes.clone(),
                        });
                    }
                }
            }
        }
        Ok(())
    }

    fn process_struct(&mut self, item: &ItemStruct) -> Result<()> {
        self.with_cfg_attrs(&item.attrs, move |this| this.process_struct_inner(item))
    }

    fn process_struct_inner(&mut self, struct_item: &ItemStruct) -> Result<()> {
        if has_turbo_attribute(&struct_item.attrs, "value") {
            self.add_value(&struct_item.ident);
            self.add_value_debug_impl(&struct_item.ident);
        }
        Ok(())
    }

    fn process_macro(&mut self, item: &ItemMacro) -> Result<()> {
        self.with_cfg_attrs(&item.attrs, move |this| this.process_macro_inner(item))
    }

    fn process_macro_inner(&mut self, macro_item: &ItemMacro) -> Result<()> {
        if macro_item
            .mac
            .path
            .is_ident("__turbo_tasks_internal_primitive")
        {
            let input = macro_item.mac.tokens.clone();
            let input = syn::parse2::<PrimitiveInput>(input).unwrap();

            let ty = input.ty;
            let Some(ident) = get_type_ident(&ty) else {
                return Ok(());
            };

            self.add_value(&ident);
            self.add_value_debug_impl(&ident);
            self.add_value_default_impl(&ident);
        } else if macro_item
            .mac
            .path
            .is_ident("__turbo_tasks_internal_generic_type")
        {
            let input = macro_item.mac.tokens.clone();
            let input = syn::parse2::<GenericTypeInput>(input).unwrap();

            let ty = input.ty;
            let Some(ident) = get_type_ident(&ty) else {
                return Ok(());
            };

            // Generic types must implement `ValueDebug` manually, as there's currently no
            // easy way to automate the process.
            self.add_value(&ident);
        }

        Ok(())
    }
}

impl RegisterContext<'_> {
    fn add_value(&mut self, ident: &Ident) {
        let key: ValueKey = (self.mod_path.clone(), ident.clone());
        let value = ValueEntry {
            trait_idents: Vec::new(),
        };

        assert!(
            self.values.insert(key, value).is_none(),
            "{ident} is declared more than once"
        );
    }

    fn add_value_debug_impl(&mut self, ident: &Ident) {
        // register default debug impl generated by proc macro
        self.add_value_trait(
            ident,
            &get_type_ident(&parse_quote! {
                turbo_tasks::debug::ValueDebug
            })
            .unwrap(),
        );
    }

    fn add_value_default_impl(&mut self, ident: &Ident) {
        // register default ValueDefault impl generated by proc macro
        self.add_value_trait(
            ident,
            &get_type_ident(&parse_quote! {
                turbo_tasks::ValueDefault
            })
            .unwrap(),
        );
    }

    fn add_value_trait(&mut self, ident: &Ident, trait_ident: &Ident) {
        let key: ValueKey = (self.mod_path.clone(), ident.clone());

        let entry = self.values.get_mut(&key);
        if entry.is_none() {
            panic!(
                "failed to add value trait {} to {} in {}. Did you try to implement a trait on a \
                 Vc instead of its value?",
                trait_ident,
                ident,
                self.file_path.display()
            );
        }
        entry.unwrap().trait_idents.push(trait_ident.clone());
    }

    fn with_cfg_attrs<T>(&mut self, attrs: &[Attribute], func: impl FnOnce(&mut Self) -> T) -> T {
        let orig_len = self.attributes.len();
        for attr in attrs.iter().filter(|a| is_cfg_attribute(a)) {
            self.attributes
                .push(Arc::new(attr.to_token_stream().to_string()));
        }
        let ret = func(self);
        self.attributes.truncate(orig_len);
        ret
    }
}

fn has_turbo_attribute(attrs: &[Attribute], name: &str) -> bool {
    attrs.iter().any(|a| is_turbo_attribute(a, name))
}

fn is_turbo_attribute(attr: &Attribute, name: &str) -> bool {
    let path = attr.path();
    if path.leading_colon.is_some() {
        return false;
    }
    let mut iter = path.segments.iter();
    match iter.next() {
        Some(seg) if seg.arguments.is_empty() && seg.ident == "turbo_tasks" => match iter.next() {
            Some(seg) if seg.arguments.is_empty() && seg.ident == name => iter.next().is_none(),
            _ => false,
        },
        _ => false,
    }
}

fn is_cfg_attribute(attr: &Attribute) -> bool {
    attr.path()
        .get_ident()
        .is_some_and(|ident| ident == "cfg" || ident == "cfg_attr")
}
