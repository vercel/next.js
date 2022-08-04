use std::{
    cell::RefCell,
    env::{self, current_dir},
    fmt::{Display, Write},
    fs::read_dir,
    path::PathBuf,
};

use anyhow::{Context, Result};
use syn::{
    Attribute, Ident, Item, ItemEnum, ItemFn, ItemImpl, ItemMod, ItemStruct, ItemTrait, Path,
    PathArguments, PathSegment, TraitItem, TraitItemMethod, Type, TypePath,
};
use turbo_tasks_macros_shared::{
    get_function_ident, get_ref_ident, get_trait_default_impl_function_ident,
    get_trait_impl_function_ident, get_trait_type_ident, get_value_type_ident, ValueTraitArguments,
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
    let cargo_lock_path = workspace_dir.join("Cargo.lock");

    // TODO: use (ask @sokra)
    let _lock = cargo_lock::Lockfile::load(cargo_lock_path).unwrap();

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

    for (filename, entry) in entries {
        // TODO hash src dir
        let hash = "TODO";

        let prefix = format!("{crate_name}@{hash}::");

        let mut functions_code = String::new();
        let mut traits_code = String::new();
        let mut values_code = String::new();

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

                code: RefCell::new(Code {
                    functions: &mut functions_code,
                    traits: &mut traits_code,
                    values: &mut values_code,
                }),
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

        let code = format!("{{\n{functions_code}{traits_code}{values_code}}}\n");
        std::fs::write(&out_file, &code).unwrap();

        // println!("cargo:warning={}", out_file.display());
        // for line in code.lines() {
        //     println!("cargo:warning={line}");
        // }
    }
}

struct Code<'a> {
    functions: &'a mut String,
    traits: &'a mut String,
    values: &'a mut String,
}

struct RegisterContext<'a> {
    queue: &'a mut Vec<(String, PathBuf)>,

    file_path: &'a PathBuf,
    mod_path: &'a str,
    prefix: &'a str,

    code: RefCell<Code<'a>>,
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
            let ident = &enum_item.ident;
            let value_name = get_value_type_ident(ident);

            self.write_register(
                self.code.borrow_mut().values,
                &value_name,
                self.get_global_name(ident, None),
            )?;

            self.write_debug_value_impl(ident)?;
        }
        Ok(())
    }

    fn process_fn(&mut self, fn_item: ItemFn) -> Result<()> {
        if has_attribute(&fn_item.attrs, "function") {
            let ident = &fn_item.sig.ident;
            let value_ident = get_function_ident(ident);

            self.write_register(
                self.code.borrow_mut().functions,
                &value_ident,
                self.get_global_name(ident, None),
            )?;
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
                        for item in impl_item.items {
                            if let syn::ImplItem::Method(method_item) = item {
                                // TODO: if method_item.attrs.iter().any(|a|
                                // is_attribute(a,
                                // "function")) {
                                let method_ident = &method_item.sig.ident;
                                let func_type_name =
                                    get_trait_impl_function_ident(struct_ident, method_ident);

                                self.write_register(
                                    self.code.borrow_mut().functions,
                                    &func_type_name,
                                    self.get_global_name(struct_ident, Some(method_ident)),
                                )?;
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
            let ident = &struct_item.ident;
            let value_ident = get_value_type_ident(ident);

            self.write_register(
                self.code.borrow_mut().values,
                &value_ident,
                self.get_global_name(ident, None),
            )?;

            self.write_debug_value_impl(ident)?;
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
                    let func_value_ident =
                        get_trait_default_impl_function_ident(trait_ident, method_ident);

                    self.write_register(
                        self.code.borrow_mut().traits,
                        &func_value_ident,
                        self.get_global_name(trait_ident, Some(method_ident)),
                    )?;
                }
            }

            let trait_value_ident = get_trait_type_ident(trait_ident);
            self.write_register(
                self.code.borrow_mut().traits,
                &trait_value_ident,
                self.get_global_name(trait_ident, None),
            )?;

            let debug = matches!(
                parse_attr_args(attr)?,
                Some(ValueTraitArguments { no_debug: false })
            );
            if debug {
                let ref_ident = get_ref_ident(trait_ident);
                self.write_debug_value_impl(&ref_ident)?;
            }
        }
        Ok(())
    }
}

impl<'a> RegisterContext<'a> {
    fn get_global_name(&self, type_ident: &Ident, fn_ident: Option<&Ident>) -> String {
        format!(
            "r##\"{}{}::{type_ident}{}\"##",
            self.prefix,
            self.mod_path,
            fn_ident
                .map(|name| format!("::{}", name))
                .unwrap_or_default()
        )
    }

    fn write_register(
        &self,
        code: &mut String,
        type_ident: impl Display,
        global_name: impl Display,
    ) -> std::fmt::Result {
        writeln!(
            code,
            "crate{}::{}.register({});",
            self.mod_path, type_ident, global_name
        )
    }

    /// Declares the default derive of the `ValueDebug` trait.
    fn write_debug_value_impl(&self, ident: &Ident) -> std::fmt::Result {
        let fn_ident = Ident::new("dbg", ident.span());

        self.write_register(
            self.code.borrow_mut().functions,
            get_trait_impl_function_ident(ident, &fn_ident),
            self.get_global_name(ident, Some(&fn_ident)),
        )
    }
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
