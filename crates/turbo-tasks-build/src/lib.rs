use std::{
    collections::{HashMap, HashSet},
    env::{self, current_dir},
    fmt::{Display, Write},
    fs::read_dir,
    path::PathBuf,
};

use anyhow::{Context, Result};
use glob::glob;
use syn::{
    Attribute, Ident, Item, ItemEnum, ItemFn, ItemImpl, ItemMod, ItemStruct, ItemTrait, Path,
    PathArguments, PathSegment, TraitItem, TraitItemMethod, Type, TypePath,
};
use turbo_tasks_macros_shared::{
    get_function_ident, get_impl_function_ident, get_ref_ident, get_register_trait_methods_ident,
    get_register_value_type_ident, get_trait_default_impl_function_ident,
    get_trait_impl_function_ident, get_trait_type_ident, ValueTraitArguments,
};

pub fn generate_register() {
    println!("cargo:rerun-if-changed=build.rs");

    let crate_dir = current_dir().unwrap();
    let workspace_dir = env::var_os("CARGO_WORKSPACE_DIR")
        .map(PathBuf::from)
        .unwrap_or_else(|| crate_dir.clone());
    let crate_name = env::var("CARGO_PKG_NAME").unwrap();
    let out_dir = PathBuf::from(env::var("OUT_DIR").unwrap());

    let src_dir = crate_dir.join("src");
    let examples_dir = crate_dir.join("examples");
    let tests_dir = crate_dir.join("tests");
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
            if item.file_type().unwrap().is_file() {
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
            if item.file_type().unwrap().is_file() {
                let name = item.file_name();
                let name = name.to_string_lossy();
                if name.ends_with(".rs") {
                    entries.push((format!("register_test_{name}"), item.path()));
                }
            }
        }
    }

    if benches_dir.exists() {
        let bench_mod = benches_dir.join("mod.rs");
        if bench_mod.is_file() {
            let name = bench_mod.file_name().unwrap();
            let name = name.to_string_lossy();
            if name.ends_with(".rs") {
                entries.push(("register_benches.rs".to_string(), bench_mod));
            }
        }
    }

    for (filename, entry) in entries {
        // TODO hash src dir
        let hash = "TODO";

        let prefix = format!("{crate_name}@{hash}::");

        let mut register_code = String::new();
        let mut values = HashMap::new();

        let out_file = out_dir.join(filename);

        let mut queue = vec![("".to_string(), entry)];

        while let Some((mod_path, file_path)) = queue.pop() {
            println!("cargo:rerun-if-changed={}", file_path.to_string_lossy());
            let src = std::fs::read_to_string(&file_path).unwrap();

            let mut ctx = RegisterContext {
                queue: &mut queue,

                file_path: &file_path,
                prefix: &prefix,
                mod_path: &mod_path,

                register: &mut register_code,
                values: &mut values,
            };

            match syn::parse_file(&src)
                .with_context(|| format!("failed to parse {}", file_path.display()))
            {
                Ok(file) => {
                    for item in file.items {
                        ctx.process_item(item).unwrap();
                    }
                }
                Err(err) => println!("{}", err),
            }
        }

        let mut values_code = String::new();
        for ((mod_path, ident), (global_name, trait_idents)) in values {
            writeln!(
                values_code,
                "crate{}::{}({}, #[allow(unused_variables)] |value| {{",
                mod_path,
                get_register_value_type_ident(&ident),
                global_name
            )
            .unwrap();
            for trait_ident in trait_idents {
                writeln!(
                    values_code,
                    "    crate{}::{}(value);",
                    mod_path,
                    get_register_trait_methods_ident(&trait_ident, &ident),
                )
                .unwrap();
            }
            writeln!(values_code, "}});").unwrap();
        }

        let code = format!("{{\n{register_code}{values_code}}}\n");
        std::fs::write(&out_file, &code).unwrap();

        // println!("cargo:warning={}", out_file.display());
        // for line in code.lines() {
        //     println!("cargo:warning={line}");
        // }
    }
}

pub fn rerun_if_glob(globs: &str) {
    let cwd = env::current_dir().unwrap();
    let globs = cwd.join(globs);
    let mut seen = HashSet::from([cwd.as_path().to_owned()]);
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
type ValueEntry = (String, Vec<Ident>);

struct RegisterContext<'a> {
    queue: &'a mut Vec<(String, PathBuf)>,

    file_path: &'a PathBuf,
    mod_path: &'a str,
    prefix: &'a str,

    register: &'a mut String,
    values: &'a mut HashMap<ValueKey, ValueEntry>,
}

impl<'a> RegisterContext<'a> {
    fn process_item(&mut self, item: Item) -> Result<()> {
        match item {
            Item::Enum(enum_item) => self.process_enum(enum_item),
            Item::Fn(fn_item) => self.process_fn(fn_item),
            Item::Impl(impl_item) => self.process_impl(impl_item),
            Item::Mod(mod_item) => self.process_mod(mod_item),
            Item::Struct(struct_item) => self.process_struct(struct_item),
            Item::Trait(trait_item) => self.process_trait(trait_item),
            _ => Ok(()),
        }
    }

    fn process_enum(&mut self, enum_item: ItemEnum) -> Result<()> {
        if has_attribute(&enum_item.attrs, "value") {
            self.add_value(&enum_item.ident);
        }
        Ok(())
    }

    fn process_fn(&mut self, fn_item: ItemFn) -> Result<()> {
        if has_attribute(&fn_item.attrs, "function") {
            let ident = &fn_item.sig.ident;
            let type_ident = get_function_ident(ident);

            self.register(type_ident, self.get_global_name(&[ident]))?;
        }
        Ok(())
    }

    fn process_impl(&mut self, impl_item: ItemImpl) -> Result<()> {
        if has_attribute(&impl_item.attrs, "value_impl") {
            if let Type::Path(TypePath {
                qself: None,
                path: Path { segments, .. },
            }) = &*impl_item.self_ty
            {
                if segments.len() == 1 {
                    if let Some(PathSegment {
                        arguments: PathArguments::None,
                        ident: struct_ident,
                    }) = segments.first()
                    {
                        let trait_ident =
                            impl_item.trait_.as_ref().and_then(|(_, trait_path, _)| {
                                trait_path.segments.last().map(|s| &s.ident)
                            });
                        if let Some(trait_ident) = trait_ident {
                            self.add_value_trait(struct_ident, trait_ident);
                        }

                        for item in impl_item.items {
                            if let syn::ImplItem::Method(method_item) = item {
                                // TODO: if method_item.attrs.iter().any(|a|
                                // is_attribute(a,
                                // "function")) {
                                let method_ident = &method_item.sig.ident;
                                let function_type_ident = if let Some(trait_ident) = trait_ident {
                                    get_trait_impl_function_ident(
                                        struct_ident,
                                        trait_ident,
                                        method_ident,
                                    )
                                } else {
                                    get_impl_function_ident(struct_ident, method_ident)
                                };

                                let global_name = if let Some(trait_ident) = trait_ident {
                                    self.get_global_name(&[struct_ident, trait_ident, method_ident])
                                } else {
                                    self.get_global_name(&[struct_ident, method_ident])
                                };

                                self.register(function_type_ident, global_name)?;
                            }
                        }
                    }
                }
            }
        }
        Ok(())
    }

    fn process_mod(&mut self, mod_item: ItemMod) -> Result<()> {
        if mod_item.content.is_none() {
            let name = mod_item.ident.to_string();
            let context = self.file_path.parent().unwrap();
            let direct = context.join(format!("{name}.rs"));
            if direct.exists() {
                self.queue
                    .push((format!("{}::{name}", self.mod_path), direct));
            } else {
                let nested = context.join(&name).join("mod.rs");
                if nested.exists() {
                    self.queue
                        .push((format!("{}::{name}", self.mod_path), nested));
                }
            }
        }
        Ok(())
    }

    fn process_struct(&mut self, struct_item: ItemStruct) -> Result<()> {
        if has_attribute(&struct_item.attrs, "value") {
            self.add_value(&struct_item.ident);
        }
        Ok(())
    }

    fn process_trait(&mut self, trait_item: ItemTrait) -> Result<()> {
        if let Some(attr) = trait_item
            .attrs
            .iter()
            .find(|a| is_attribute(a, "value_trait"))
        {
            let trait_ident = &trait_item.ident;

            for item in &trait_item.items {
                if let TraitItem::Method(TraitItemMethod {
                    default: Some(_),
                    sig,
                    ..
                }) = item
                {
                    let method_ident = &sig.ident;
                    let function_type_ident =
                        get_trait_default_impl_function_ident(trait_ident, method_ident);

                    self.register(
                        function_type_ident,
                        self.get_global_name(&[trait_ident, method_ident]),
                    )?;
                }
            }

            let trait_type_ident = get_trait_type_ident(trait_ident);
            self.register(trait_type_ident, self.get_global_name(&[trait_ident]))?;

            let trait_args: ValueTraitArguments = parse_attr_args(attr)?.unwrap_or_default();
            if trait_args.debug {
                let ref_ident = get_ref_ident(trait_ident);
                self.register_debug_impl(&ref_ident, DebugType::Trait)?;
            }
        }
        Ok(())
    }
}

impl<'a> RegisterContext<'a> {
    fn get_global_name(&self, parts: &[&Ident]) -> String {
        format!(
            "r##\"{}{}::{}\"##",
            self.prefix,
            self.mod_path,
            parts
                .iter()
                .map(ToString::to_string)
                .collect::<Vec<_>>()
                .join("::")
        )
    }

    fn add_value(&mut self, ident: &Ident) {
        let key: ValueKey = (self.mod_path.to_owned(), ident.clone());
        let value: ValueEntry = (self.get_global_name(&[ident]), Vec::new());

        assert!(
            self.values.insert(key, value).is_none(),
            "{} is declared more than once",
            ident
        );

        // register default debug impl generated by proc macro
        self.register_debug_impl(ident, DebugType::Value).unwrap();
        self.add_value_trait(ident, &Ident::new("ValueDebug", ident.span()));
    }

    fn add_value_trait(&mut self, ident: &Ident, trait_ident: &Ident) {
        let key: ValueKey = (self.mod_path.to_owned(), ident.clone());

        let entry = self.values.get_mut(&key);
        if entry.is_none() {
            panic!(
                "failed to add value trait {} to {} in {}",
                trait_ident,
                ident,
                self.file_path.display()
            );
        }
        entry.unwrap().1.push(trait_ident.clone());
    }

    fn register(
        &mut self,
        type_ident: impl Display,
        global_name: impl Display,
    ) -> std::fmt::Result {
        writeln!(
            self.register,
            "crate{}::{}.register({});",
            self.mod_path, type_ident, global_name
        )
    }

    /// Declares the default derive of the `ValueDebug` trait.
    fn register_debug_impl(&mut self, ident: &Ident, dbg_ty: DebugType) -> std::fmt::Result {
        let fn_ident = Ident::new("dbg", ident.span());

        let (impl_fn_ident, global_name) = match dbg_ty {
            DebugType::Value => {
                let trait_ident = Ident::new("ValueDebug", ident.span());
                (
                    get_trait_impl_function_ident(ident, &trait_ident, &fn_ident),
                    self.get_global_name(&[ident, &trait_ident, &fn_ident]),
                )
            }
            DebugType::Trait => (
                get_impl_function_ident(ident, &fn_ident),
                self.get_global_name(&[ident, &fn_ident]),
            ),
        };

        self.register(impl_fn_ident, global_name)
    }
}

// FIXME: traits currently don't implement the trait directly because
// `turbo_tasks::value_impl` would try to wrap the TraitVc in another Vc
// (TraitVcVc).
enum DebugType {
    Value,
    Trait,
}

fn has_attribute(attrs: &[Attribute], name: &str) -> bool {
    attrs.iter().any(|a| is_attribute(a, name))
}

fn is_attribute(attr: &Attribute, name: &str) -> bool {
    let path = &attr.path;
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

fn parse_attr_args<T>(attr: &Attribute) -> syn::Result<Option<T>>
where
    T: syn::parse::Parse,
{
    if attr.tokens.is_empty() {
        Ok(None)
    } else {
        Ok(Some(attr.parse_args_with(T::parse)?))
    }
}
