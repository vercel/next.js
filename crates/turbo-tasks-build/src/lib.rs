use std::{
    env::{self, current_dir},
    fmt::Write,
    fs::read_dir,
    path::PathBuf,
};

use anyhow::Context;
use syn::{Attribute, Item, Path, PathArguments, PathSegment, Type, TypePath};

pub fn generate_register() {
    println!("cargo:rerun-if-changed=build.rs");

    let crate_dir = current_dir().unwrap();
    let crate_name = env::var("CARGO_PKG_NAME").unwrap();
    let out_dir = PathBuf::from(env::var("OUT_DIR").unwrap());

    let src_dir = crate_dir.join("src");
    let examples_dir = crate_dir.join("examples");
    let tests_dir = crate_dir.join("tests");
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

        let mut traits_code = String::new();
        let mut values_code = String::new();
        let mut functions_code = String::new();

        let out_file = out_dir.join(filename);

        let mut queue = vec![("".to_string(), entry)];

        while let Some((mod_path, file_path)) = queue.pop() {
            println!("cargo:rerun-if-changed={}", file_path.to_string_lossy());
            let src = std::fs::read_to_string(&file_path).unwrap();
            let file = syn::parse_file(&src)
                .with_context(|| format!("failed to parse {}", file_path.display()))
                .unwrap();
            for item in file.items {
                match item {
                    Item::Enum(enum_item) => {
                        if enum_item.attrs.iter().any(|a| is_attribute(a, "value")) {
                            let name = enum_item.ident.to_string();
                            writeln!(
                                values_code,
                                "crate{mod_path}::{}_VALUE_TYPE.register({});",
                                name.to_uppercase(),
                                format_args!("r##\"{prefix}{mod_path}::{name}\"##"),
                            )
                            .unwrap();
                        }
                    }
                    Item::Fn(fn_item) => {
                        if fn_item.attrs.iter().any(|a| is_attribute(a, "function")) {
                            let name = fn_item.sig.ident.to_string();
                            writeln!(
                                functions_code,
                                "crate{mod_path}::{}_FUNCTION.register({});",
                                name.to_uppercase(),
                                format_args!("r##\"{prefix}{mod_path}::{name}\"##"),
                            )
                            .unwrap();
                        }
                    }
                    Item::Impl(impl_item) => {
                        if impl_item
                            .attrs
                            .iter()
                            .any(|a| is_attribute(a, "value_impl"))
                        {
                            if let Type::Path(TypePath {
                                qself: None,
                                path: Path { segments, .. },
                            }) = &*impl_item.self_ty
                            {
                                if segments.len() == 1 {
                                    if let Some(PathSegment {
                                        arguments: PathArguments::None,
                                        ident,
                                    }) = segments.first()
                                    {
                                        let struct_name = ident.to_string();
                                        for item in impl_item.items {
                                            if let syn::ImplItem::Method(method_item) = item {
                                                // TODO: if method_item.attrs.iter().any(|a|
                                                // is_attribute(a,
                                                // "function")) {
                                                let name = method_item.sig.ident.to_string();
                                                writeln!(
                                                    functions_code,
                                                    "crate{mod_path}::{}_IMPL_{}_FUNCTION.\
                                                     register({});",
                                                    struct_name.to_uppercase(),
                                                    name.to_uppercase(),
                                                    format_args!(
                                                        "r##\"{prefix}{mod_path}::{struct_name}::\
                                                         {name}\"##"
                                                    ),
                                                )
                                                .unwrap();
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    }
                    Item::Mod(mod_item) => {
                        if mod_item.content.is_none() {
                            let name = mod_item.ident.to_string();
                            let context = file_path.parent().unwrap();
                            let direct = context.join(format!("{name}.rs"));
                            if direct.exists() {
                                queue.push((format!("{mod_path}::{name}"), direct));
                            } else {
                                let nested = context.join(&name).join("mod.rs");
                                if nested.exists() {
                                    queue.push((format!("{mod_path}::{name}"), nested));
                                }
                            }
                        }
                    }
                    Item::Struct(struct_item) => {
                        if struct_item.attrs.iter().any(|a| is_attribute(a, "value")) {
                            let name = struct_item.ident.to_string();
                            writeln!(
                                values_code,
                                "crate{mod_path}::{}_VALUE_TYPE.register({});",
                                name.to_uppercase(),
                                format_args!("r##\"{prefix}{mod_path}::{name}\"##"),
                            )
                            .unwrap();
                        }
                    }
                    Item::Trait(trait_item) => {
                        if trait_item
                            .attrs
                            .iter()
                            .any(|a| is_attribute(a, "value_trait"))
                        {
                            let name = trait_item.ident.to_string();
                            writeln!(
                                traits_code,
                                "crate{mod_path}::{}_TRAIT_TYPE.register({});",
                                name.to_uppercase(),
                                format_args!("r##\"{prefix}{mod_path}::{name}\"##"),
                            )
                            .unwrap();
                        }
                    }
                    _ => {}
                }
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
