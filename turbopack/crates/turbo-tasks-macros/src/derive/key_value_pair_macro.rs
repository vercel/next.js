use proc_macro::TokenStream;
use quote::quote;
use syn::{parse_macro_input, Ident, ItemEnum};

pub fn derive_key_value_pair(input: TokenStream) -> TokenStream {
    let input = parse_macro_input!(input as ItemEnum);

    let ident = &input.ident;
    let vis = &input.vis;
    let type_name = Ident::new(&format!("{}Type", input.ident), input.ident.span());
    let key_name = Ident::new(&format!("{}Key", input.ident), input.ident.span());
    let value_name = Ident::new(&format!("{}Value", input.ident), input.ident.span());
    let value_ref_name = Ident::new(&format!("{}ValueRef", input.ident), input.ident.span());
    let value_ref_mut_name = Ident::new(&format!("{}ValueRefMut", input.ident), input.ident.span());
    let iter_name = Ident::new(&format!("{}Iter", input.ident), input.ident.span());
    let storage_name = Ident::new(&format!("{}Storage", input.ident), input.ident.span());

    let variant_names = input
        .variants
        .iter()
        .map(|variant| &variant.ident)
        .collect::<Vec<_>>();

    let key_fields = input
        .variants
        .iter()
        .map(|variant| {
            variant
                .fields
                .iter()
                .filter(|field| {
                    let Some(ident) = &field.ident else {
                        return false;
                    };
                    ident != "value"
                })
                .collect::<Vec<_>>()
        })
        .collect::<Vec<_>>();

    let value_fields = input
        .variants
        .iter()
        .map(|variant| {
            variant
                .fields
                .iter()
                .filter(|field| {
                    let Some(ident) = &field.ident else {
                        return false;
                    };
                    ident == "value"
                })
                .collect::<Vec<_>>()
        })
        .collect::<Vec<_>>();

    let key_decl = field_declarations(&key_fields);
    let key_pat = patterns(&key_fields);
    let key_clone_fields = clone_fields(&key_fields);

    let value_decl = field_declarations(&value_fields);
    let value_pat = patterns(&value_fields);
    let value_clone_fields = clone_fields(&value_fields);

    let value_ref_decl = ref_field_declarations(&value_fields);
    let value_ref_mut_decl = mut_ref_field_declarations(&value_fields);
    let value_ref_fields = ref_fields(&value_fields);

    let storage = key_fields
        .iter()
        .zip(value_fields.iter()).zip(variant_names.iter())
        .map(|((key_fields, value_fields), variant_name)| {
            let value_types = value_fields
                .iter()
                .map(|field| {
                    let ty = &field.ty;
                    quote! {
                        #ty
                    }
                })
                .collect::<Vec<_>>();
            let key_types = key_fields
                .iter()
                .map(|field| {
                    let ty = &field.ty;
                    quote! {
                        #ty
                    }
                })
                .collect::<Vec<_>>();
            let value_fields = value_fields
                .iter()
                .map(|field| {
                    let ident = field.ident.as_ref().unwrap();
                    quote! {
                        #ident
                    }
                })
                .collect::<Vec<_>>();
            let key_fields = key_fields
                .iter()
                .map(|field| {
                    let ident = field.ident.as_ref().unwrap();
                    quote! {
                        #ident
                    }
                })
                .collect::<Vec<_>>();
            match (key_types.len(), value_types.len()) {
                (0, 1) => {
                    StorageDecl {
                        decl: quote! {
                            storage: Option<#(#value_types)*>,
                        },
                        add: quote! {
                            (#storage_name::#variant_name { storage }, #ident::#variant_name { #(#value_fields)* }) => {
                                if storage.is_none() {
                                    *storage = Some(#(#value_fields)*);
                                    true
                                } else {
                                    false
                                }
                            }
                        },
                        insert: quote! {
                            (#storage_name::#variant_name { storage }, #ident::#variant_name { #(#value_fields)* }) => {
                                std::mem::replace(storage, Some(#(#value_fields)*))
                                    .map(|#(#value_fields)*| #value_name::#variant_name { #(#value_fields)* })
                            }
                        },
                        remove: quote! {
                            (#storage_name::#variant_name { storage }, #key_name::#variant_name {}) => {
                                storage.take()
                                    .map(|#(#value_fields)*| #value_name::#variant_name { #(#value_fields)* })
                            }
                        },
                        contains_key: quote! {
                            (#storage_name::#variant_name { storage }, #key_name::#variant_name {}) => {
                                storage.is_some()
                            }
                        },
                        get: quote! {
                            (#storage_name::#variant_name { storage }, #key_name::#variant_name {}) => {
                                storage.as_ref()
                                    .map(|#(#value_fields)*| #value_ref_name::#variant_name { #(#value_fields)* })
                            }
                        },
                        get_mut: quote! {
                            (#storage_name::#variant_name { storage }, #key_name::#variant_name {}) => {
                                storage.as_mut()
                                    .map(|#(#value_fields)*| #value_ref_mut_name::#variant_name { #(#value_fields)* })
                            }
                        },
                        get_mut_or_insert_with: quote! {
                            (#storage_name::#variant_name { storage }, #key_name::#variant_name {}) => {
                                #value_ref_mut_name::#variant_name {
                                    #(#value_fields)*: storage
                                        .get_or_insert_with(|| {
                                            let #value_name::#variant_name { #(#value_fields)* } = insert_with() else {
                                                unreachable!();
                                            };
                                            #(#value_fields)*
                                        })
                                }
                            }
                        },
                        shrink_to_fit: quote! {
                            #storage_name::#variant_name { .. } => {
                                // nothing to do
                            }
                        },
                        is_empty: quote! {
                            #storage_name::#variant_name { storage } => {
                                storage.is_none()
                            }
                        },
                        len: quote! {
                            #storage_name::#variant_name { storage } => {
                                if storage.is_some() { 1 } else { 0 }
                            }
                        },
                        iter: quote! {
                            #storage_name::#variant_name { storage } => {
                                #iter_name::#variant_name(storage.iter())
                            }
                        },
                        iterator: quote! {
                            std::option::Iter<'l, #(#value_types)*>
                        },
                        iterator_next: quote! {
                            iter.next().map(|#(#value_fields)*| (#key_name::#variant_name {}, #value_ref_name::#variant_name { #(#value_fields)* }))
                        },
                    }
                }
                (1, 1) => {
                    StorageDecl {
                        decl: quote! {
                            storage: auto_hash_map::AutoMap<#(#key_types)*, #(#value_types)*, std::hash::BuildHasherDefault<rustc_hash::FxHasher>, 1>,
                        },
                        add: quote! {
                            (#storage_name::#variant_name { storage }, #ident::#variant_name { #(#key_fields)*, #(#value_fields)* }) => {
                                match storage.entry(#(#key_fields)*) {
                                    auto_hash_map::map::Entry::Occupied(_) => false,
                                    auto_hash_map::map::Entry::Vacant(e) => {
                                        e.insert(#(#value_fields)*);
                                        true
                                    }
                                }
                            }
                        },
                        insert: quote! {
                            (#storage_name::#variant_name { storage }, #ident::#variant_name { #(#key_fields)*, #(#value_fields)* }) => {
                                storage.insert(#(#key_fields)*, #(#value_fields)*)
                                    .map(|#(#value_fields)*| #value_name::#variant_name { #(#value_fields)* })
                            }
                        },
                        remove: quote! {
                            (#storage_name::#variant_name { storage }, #key_name::#variant_name { #(#key_fields)* }) => {
                                let result = storage.remove(#(#key_fields)*)
                                    .map(|#(#value_fields)*| #value_name::#variant_name { #(#value_fields)* });
                                if result.is_some() {
                                    storage.shrink_amortized();
                                }
                                result
                            }
                        },
                        contains_key: quote! {
                            (#storage_name::#variant_name { storage }, #key_name::#variant_name { #(#key_fields)* }) => {
                                storage.contains_key(#(#key_fields)*)
                            }
                        },
                        get: quote! {
                            (#storage_name::#variant_name { storage }, #key_name::#variant_name { #(#key_fields)* }) => {
                                storage.get(#(#key_fields)*)
                                    .map(|#(#value_fields)*| #value_ref_name::#variant_name { #(#value_fields)* })
                            }
                        },
                        get_mut: quote! {
                            (#storage_name::#variant_name { storage }, #key_name::#variant_name { #(#key_fields)* }) => {
                                storage.get_mut(#(#key_fields)*)
                                    .map(|#(#value_fields)*| #value_ref_mut_name::#variant_name { #(#value_fields)* })
                            }
                        },
                        get_mut_or_insert_with: quote! {
                            (#storage_name::#variant_name { storage }, #key_name::#variant_name { #(#key_fields)* }) => {
                                #value_ref_mut_name::#variant_name {
                                    #(#value_fields)*: storage
                                        .entry(*#(#key_fields)*)
                                        .or_insert_with(|| {
                                            let #value_name::#variant_name { #(#value_fields)* } = insert_with() else {
                                                unreachable!();
                                            };
                                            #(#value_fields)*
                                        })
                                }
                            }
                        },
                        shrink_to_fit: quote! {
                            #storage_name::#variant_name { storage } => {
                                storage.shrink_to_fit()
                            }
                        },
                        is_empty: quote! {
                            #storage_name::#variant_name { storage } => {
                                storage.is_empty()
                            }
                        },
                        len: quote! {
                            #storage_name::#variant_name { storage } => {
                                storage.len()
                            }
                        },
                        iter: quote! {
                            #storage_name::#variant_name { storage } => {
                                #iter_name::#variant_name(storage.iter())
                            }
                        },
                        iterator: quote! {
                            auto_hash_map::map::Iter<'l, #(#key_types)*, #(#value_types)*>
                        },
                        iterator_next: quote! {
                            iter.next()
                            .map(|(#(#key_fields)*, #(#value_fields)*)| (#key_name::#variant_name { #(#key_fields: *#key_fields)* }, #value_ref_name::#variant_name { #(#value_fields)* }))
                        },
                    }
                }
                (_, 1) => {
                    StorageDecl {
                        decl: quote! {
                            storage: auto_hash_map::AutoMap<(#(#key_types),*), #(#value_types)*, std::hash::BuildHasherDefault<rustc_hash::FxHasher>, 1>,
                        },
                        add: quote! {
                            (#storage_name::#variant_name { storage }, #ident::#variant_name { #(#key_fields),*, #(#value_fields)* }) => {
                                match storage.entry((#(#key_fields),*)) {
                                    auto_hash_map::map::Entry::Occupied(_) => false,
                                    auto_hash_map::map::Entry::Vacant(e) => {
                                        e.insert(#(#value_fields)*);
                                        true
                                    }
                                }
                            }
                        },
                        insert: quote! {
                            (#storage_name::#variant_name { storage }, #ident::#variant_name { #(#key_fields),*, #(#value_fields)* }) => {
                                storage.insert((#(#key_fields),*), #(#value_fields)*)
                                    .map(|#(#value_fields)*| #value_name::#variant_name { #(#value_fields)* })
                            }
                        },
                        remove: quote! {
                            (#storage_name::#variant_name { storage }, &#key_name::#variant_name { #(#key_fields),* }) => {
                                let result = storage.remove(&(#(#key_fields),*))
                                    .map(|#(#value_fields)*| #value_name::#variant_name { #(#value_fields)* });
                                if result.is_some() {
                                    storage.shrink_amortized();
                                }
                                result
                            }
                        },
                        contains_key: quote! {
                            (#storage_name::#variant_name { storage }, &#key_name::#variant_name { #(#key_fields),* }) => {
                                storage.contains_key(&(#(#key_fields),*))
                            }
                        },
                        get: quote! {
                            (#storage_name::#variant_name { storage }, &#key_name::#variant_name { #(#key_fields),* }) => {
                                storage.get(&(#(#key_fields),*))
                                    .map(|#(#value_fields)*| #value_ref_name::#variant_name { #(#value_fields)* })
                            }
                        },
                        get_mut: quote! {
                            (#storage_name::#variant_name { storage }, &#key_name::#variant_name { #(#key_fields),* }) => {
                                storage.get_mut(&(#(#key_fields),*))
                                    .map(|#(#value_fields)*| #value_ref_mut_name::#variant_name { #(#value_fields)* })
                            }
                        },
                        get_mut_or_insert_with: quote! {
                            (#storage_name::#variant_name { storage }, #key_name::#variant_name { #(#key_fields),* }) => {
                                #value_ref_mut_name::#variant_name {
                                    #(#value_fields)*: storage
                                        .entry((#(*#key_fields),*))
                                        .or_insert_with(|| {
                                            let #value_name::#variant_name { #(#value_fields)* } = insert_with() else {
                                                unreachable!();
                                            };
                                            #(#value_fields)*
                                        })
                                }
                            }
                        },
                        shrink_to_fit: quote! {
                            #storage_name::#variant_name { storage } => {
                                storage.shrink_to_fit()
                            }
                        },
                        is_empty: quote! {
                            #storage_name::#variant_name { storage } => {
                                storage.is_empty()
                            }
                        },
                        len: quote! {
                            #storage_name::#variant_name { storage } => {
                                storage.len()
                            }
                        },
                        iter: quote! {
                            #storage_name::#variant_name { storage } => {
                                #iter_name::#variant_name(storage.iter())
                            }
                        },
                        iterator: quote! {
                            auto_hash_map::map::Iter<'l, (#(#key_types),*), #(#value_types)*>
                        },
                        iterator_next: quote! {
                            iter.next()
                                .map(|((#(#key_fields),*), #(#value_fields)*)| (#key_name::#variant_name { #(#key_fields: *#key_fields),* }, #value_ref_name::#variant_name { #(#value_fields)* }))
                        },
                    }
                }
                _ => unreachable!()
            }
        })
        .collect::<Vec<_>>();

    let storage_decl = storage.iter().map(|decl| &decl.decl).collect::<Vec<_>>();
    let storage_add = storage.iter().map(|decl| &decl.add).collect::<Vec<_>>();
    let storage_insert = storage.iter().map(|decl| &decl.insert).collect::<Vec<_>>();
    let storage_remove = storage.iter().map(|decl| &decl.remove).collect::<Vec<_>>();
    let storage_contains_key = storage
        .iter()
        .map(|decl| &decl.contains_key)
        .collect::<Vec<_>>();
    let storage_get = storage.iter().map(|decl| &decl.get).collect::<Vec<_>>();
    let storage_get_mut = storage.iter().map(|decl| &decl.get_mut).collect::<Vec<_>>();
    let storage_get_mut_or_insert_with = storage
        .iter()
        .map(|decl| &decl.get_mut_or_insert_with)
        .collect::<Vec<_>>();
    let storage_shrink_to_fit = storage
        .iter()
        .map(|decl| &decl.shrink_to_fit)
        .collect::<Vec<_>>();
    let storage_is_empty = storage
        .iter()
        .map(|decl| &decl.is_empty)
        .collect::<Vec<_>>();
    let storage_len = storage.iter().map(|decl| &decl.len).collect::<Vec<_>>();
    let storage_iter = storage.iter().map(|decl| &decl.iter).collect::<Vec<_>>();
    let storage_iterator = storage
        .iter()
        .map(|decl| &decl.iterator)
        .collect::<Vec<_>>();
    let storage_iterator_next = storage
        .iter()
        .map(|decl| &decl.iterator_next)
        .collect::<Vec<_>>();

    quote! {
        impl turbo_tasks::KeyValuePair for #ident {
            type Type = #type_name;
            type Key = #key_name;
            type Value = #value_name;
            type ValueRef<'l> = #value_ref_name<'l> where Self: 'l;
            type ValueRefMut<'l> = #value_ref_mut_name<'l> where Self: 'l;

            fn ty(&self) -> #type_name {
                match self {
                    #(
                        #ident::#variant_names { .. } => #type_name::#variant_names,
                    )*
                }
            }

            fn key(&self) -> #key_name {
                match self {
                    #(
                        #ident::#variant_names { #key_pat .. } => #key_name::#variant_names { #key_clone_fields },
                    )*
                }
            }

            fn value(&self) -> #value_name {
                match self {
                    #(
                        #ident::#variant_names { #value_pat .. } => #value_name::#variant_names { #value_clone_fields },
                    )*
                }
            }

            fn value_ref(&self) -> #value_ref_name<'_> {
                match self {
                    #(
                        #ident::#variant_names { #value_pat .. } => #value_ref_name::#variant_names { #value_ref_fields },
                    )*
                }
            }

            fn value_mut(&mut self) -> #value_ref_mut_name<'_> {
                match self {
                    #(
                        #ident::#variant_names { #value_pat .. } => #value_ref_mut_name::#variant_names { #value_ref_fields },
                    )*
                }
            }

            fn from_key_and_value(key: #key_name, value: #value_name) -> Self {
                match (key, value) {
                    #(
                        (#key_name::#variant_names { #key_pat }, #value_name::#variant_names { #value_pat }) => #ident::#variant_names { #key_pat #value_pat },
                    )*
                    _ => panic!("Invalid key and value combination"),
                }
            }

            fn into_key_and_value(self) -> (#key_name, #value_name) {
                match self {
                    #(
                        #ident::#variant_names { #key_pat #value_pat } => (#key_name::#variant_names { #key_pat }, #value_name::#variant_names { #value_pat }),
                    )*
                }
            }
        }

        #[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
        #vis enum #type_name {
            #(
                #variant_names,
            )*
        }

        #[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
        #vis enum #key_name {
            #(
                #variant_names {
                    #key_decl
                },
            )*
        }

        #[derive(Debug, Clone, Default, PartialEq, Eq)]
        #vis enum #value_name {
            #(
                #variant_names {
                    #value_decl
                },
            )*
            #[default]
            Reserved,
        }

        #[derive(Debug, Copy, Clone, PartialEq, Eq)]
        #vis enum #value_ref_name<'l> {
            #(
                #variant_names {
                    #value_ref_decl
                },
            )*
        }

        #[derive(Debug, PartialEq, Eq)]
        #vis enum #value_ref_mut_name<'l> {
            #(
                #variant_names {
                    #value_ref_mut_decl
                },
            )*
        }

        impl #key_name {
            pub fn ty(&self) -> #type_name {
                match self {
                    #(
                        #key_name::#variant_names { .. } => #type_name::#variant_names,
                    )*
                }
            }
        }

        impl #value_name {
            pub fn as_ref(&self) -> #value_ref_name<'_> {
                match self {
                    #(
                        #value_name::#variant_names { #value_pat .. } => #value_ref_name::#variant_names { #value_ref_fields },
                    )*
                    #value_name::Reserved => unreachable!(),
                }
            }

            pub fn as_mut(&mut self) -> #value_ref_mut_name<'_> {
                match self {
                    #(
                        #value_name::#variant_names { #value_pat .. } => #value_ref_mut_name::#variant_names { #value_ref_fields },
                    )*
                    #value_name::Reserved => unreachable!(),
                }
            }
        }

        #vis enum #storage_name {
            #(
                #variant_names {
                    #storage_decl
                },
            )*
        }

        impl #storage_name {
            pub fn new(ty: #type_name) -> Self {
                match ty {
                    #(
                        #type_name::#variant_names => #storage_name::#variant_names { storage: Default::default() },
                    )*
                }
            }

            pub fn ty(&self) -> #type_name {
                match self {
                    #(
                        #storage_name::#variant_names { .. } => #type_name::#variant_names,
                    )*
                }
            }

            pub fn add(&mut self, item: #ident) -> bool {
                match (self, item) {
                    #(
                        #storage_add
                    )*
                    _ => unreachable!(),
                }
            }

            pub fn insert(&mut self, item: #ident) -> Option<#value_name> {
                match (self, item) {
                    #(
                        #storage_insert
                    )*
                    _ => unreachable!(),
                }
            }

            pub fn remove(&mut self, key: &#key_name) -> Option<#value_name> {
                match (self, key) {
                    #(
                        #storage_remove
                    )*
                    _ => unreachable!(),
                }
            }

            pub fn contains_key(&self, key: &#key_name) -> bool {
                match (self, key) {
                    #(
                        #storage_contains_key
                    )*
                    _ => unreachable!(),
                }
            }

            pub fn get(&self, key: &#key_name) -> Option<#value_ref_name> {
                match (self, key) {
                    #(
                        #storage_get
                    )*
                    _ => unreachable!(),
                }
            }

            pub fn get_mut(&mut self, key: &#key_name) -> Option<#value_ref_mut_name> {
                match (self, key) {
                    #(
                        #storage_get_mut
                    )*
                    _ => unreachable!(),
                }
            }

            pub fn get_mut_or_insert_with(&mut self, key: &#key_name, insert_with: impl FnOnce() -> #value_name) -> #value_ref_mut_name {
                match (self, key) {
                    #(
                        #storage_get_mut_or_insert_with
                    )*
                    _ => unreachable!(),
                }
            }

            pub fn shrink_to_fit(&mut self) {
                match self {
                    #(
                        #storage_shrink_to_fit
                    )*
                }
            }

            pub fn is_empty(&self) -> bool {
                match self {
                    #(
                        #storage_is_empty
                    )*
                }
            }

            pub fn len(&self) -> usize {
                match self {
                    #(
                        #storage_len
                    )*
                }
            }

            pub fn iter(&self) -> #iter_name {
                match self {
                    #(
                        #storage_iter
                    )*
                }
            }
        }

        #vis enum #iter_name<'l> {
            #(
                #variant_names(#storage_iterator),
            )*
        }

        impl<'l> Iterator for #iter_name<'l> {
            type Item = (#key_name, #value_ref_name<'l>);

            fn next(&mut self) -> Option<Self::Item> {
                match self {
                    #(
                        #iter_name::#variant_names(iter) => {
                            #storage_iterator_next
                        }
                    )*
                }
            }
        }
    }
    .into()
}

fn patterns(fields: &[Vec<&syn::Field>]) -> Vec<proc_macro2::TokenStream> {
    let variant_pat = fields
        .iter()
        .map(|fields| {
            let pat = fields
                .iter()
                .map(|field| {
                    let ident = field.ident.as_ref().unwrap();
                    quote! {
                        #ident
                    }
                })
                .collect::<Vec<_>>();
            quote! {
                #(#pat,)*
            }
        })
        .collect::<Vec<_>>();
    variant_pat
}

fn clone_fields(fields: &[Vec<&syn::Field>]) -> Vec<proc_macro2::TokenStream> {
    let variant_pat = fields
        .iter()
        .map(|fields| {
            let pat = fields
                .iter()
                .map(|field| {
                    let ident = field.ident.as_ref().unwrap();
                    quote! {
                        #ident: #ident.clone()
                    }
                })
                .collect::<Vec<_>>();
            quote! {
                #(#pat,)*
            }
        })
        .collect::<Vec<_>>();
    variant_pat
}

fn ref_fields(fields: &[Vec<&syn::Field>]) -> Vec<proc_macro2::TokenStream> {
    let variant_pat = fields
        .iter()
        .map(|fields| {
            let pat = fields
                .iter()
                .map(|field| {
                    let ident = field.ident.as_ref().unwrap();
                    quote! {
                        #ident
                    }
                })
                .collect::<Vec<_>>();
            quote! {
                #(#pat,)*
            }
        })
        .collect::<Vec<_>>();
    variant_pat
}

fn field_declarations(fields: &[Vec<&syn::Field>]) -> Vec<proc_macro2::TokenStream> {
    fields
        .iter()
        .map(|fields| {
            let fields = fields
                .iter()
                .map(|field| {
                    let ty = &field.ty;
                    let ident = field.ident.as_ref().unwrap();
                    let attrs = &field.attrs;
                    quote! {
                        #(#attrs)*
                        #ident: #ty
                    }
                })
                .collect::<Vec<_>>();
            quote! {
                #(#fields),*
            }
        })
        .collect::<Vec<_>>()
}

fn ref_field_declarations(fields: &[Vec<&syn::Field>]) -> Vec<proc_macro2::TokenStream> {
    fields
        .iter()
        .map(|fields| {
            let fields = fields
                .iter()
                .map(|field| {
                    let ty = &field.ty;
                    let ident = field.ident.as_ref().unwrap();
                    let attrs = &field.attrs;
                    quote! {
                        #(#attrs)*
                        #ident: &'l #ty
                    }
                })
                .collect::<Vec<_>>();
            quote! {
                #(#fields),*
            }
        })
        .collect::<Vec<_>>()
}

fn mut_ref_field_declarations(fields: &[Vec<&syn::Field>]) -> Vec<proc_macro2::TokenStream> {
    fields
        .iter()
        .map(|fields| {
            let fields = fields
                .iter()
                .map(|field| {
                    let ty = &field.ty;
                    let ident = field.ident.as_ref().unwrap();
                    let attrs = &field.attrs;
                    quote! {
                        #(#attrs)*
                        #ident: &'l mut #ty
                    }
                })
                .collect::<Vec<_>>();
            quote! {
                #(#fields),*
            }
        })
        .collect::<Vec<_>>()
}

struct StorageDecl {
    decl: proc_macro2::TokenStream,
    add: proc_macro2::TokenStream,
    insert: proc_macro2::TokenStream,
    remove: proc_macro2::TokenStream,
    contains_key: proc_macro2::TokenStream,
    get: proc_macro2::TokenStream,
    get_mut: proc_macro2::TokenStream,
    get_mut_or_insert_with: proc_macro2::TokenStream,
    shrink_to_fit: proc_macro2::TokenStream,
    is_empty: proc_macro2::TokenStream,
    len: proc_macro2::TokenStream,
    iter: proc_macro2::TokenStream,

    iterator: proc_macro2::TokenStream,
    iterator_next: proc_macro2::TokenStream,
}
