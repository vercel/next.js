use proc_macro::TokenStream;
use quote::quote;
use syn::{
    Data, DeriveInput, Fields, Ident, Meta, Token, Type, parse_macro_input, punctuated::Punctuated,
    spanned::Spanned,
};

/// Derives the TaskStorage trait and generates optimized storage structures.
///
/// This macro analyzes field annotations and generates:
/// 1. Grouped data structures (e.g., DependencyData, AggregationData)
/// 2. Lazy-allocated storage with Option<Box<...>>
/// 3. Typed accessor methods
/// 4. Modification tracking integration
///
/// # Attributes
///
/// - `#[task_storage(storage = "...")]` - Specifies the storage type:
///   - `direct` - Direct field access (e.g., `Option<OutputValue>`)
///   - `auto_set` - Uses AutoSet for small collections
///   - `counter_map` - Uses CounterMap for reference counting
///   - `indexed_vec` - Uses IndexedVec for direct index access
///
/// - `#[task_storage(category = "...")]` - Data vs Meta categorization:
///   - `data` - Frequently changed, bulk I/O
///   - `meta` - Rarely changed, small I/O
///
/// - `#[task_storage(group = "...")]` - Groups related fields together
///
/// - `#[task_storage(lazy)]` - Wraps field group in Option<Box<...>>
pub fn derive_task_storage(input: TokenStream) -> TokenStream {
    let input = parse_macro_input!(input as DeriveInput);

    match &input.data {
        Data::Struct(data_struct) => {
            let ident = &input.ident;

            // Parse field annotations
            let storage_fields = match &data_struct.fields {
                Fields::Named(fields) => fields
                    .named
                    .iter()
                    .map(parse_field_storage_attributes)
                    .collect::<Vec<_>>(),
                _ => {
                    return syn::Error::new(
                        input.span(),
                        "TaskStorage can only be derived for structs with named fields",
                    )
                    .to_compile_error()
                    .into();
                }
            };

            // Group fields by group name and category
            let grouped_fields = group_fields(&storage_fields);

            // Generate the implementation
            generate_task_storage_impl(ident, &grouped_fields)
        }
        _ => syn::Error::new(input.span(), "TaskStorage can only be derived for structs")
            .to_compile_error()
            .into(),
    }
}

#[derive(Debug, Clone)]
struct StorageFieldAttributes {
    field_name: Ident,
    field_type: Type,
    storage_type: StorageType,
    category: Category,
    group: Option<String>,
    lazy: bool,
    specialized: bool,
}

#[derive(Debug, Clone, PartialEq, Eq)]
enum StorageType {
    Direct,
    AutoSet,
    CounterMap,
    IndexedVec,
}

#[derive(Debug, Clone, PartialEq, Eq)]
enum Category {
    Data,
    Meta,
}

fn parse_field_storage_attributes(field: &syn::Field) -> StorageFieldAttributes {
    let field_name = field.ident.as_ref().unwrap().clone();
    let field_type = field.ty.clone();

    // Default values
    let mut storage_type = StorageType::Direct;
    let mut category = Category::Data;
    let mut group = None;
    let mut lazy = false;
    let mut specialized = false;

    // Parse attributes
    for attr in &field.attrs {
        if !attr
            .path()
            .get_ident()
            .map(|ident| *ident == "task_storage")
            .unwrap_or_default()
        {
            continue;
        }

        let nested = match attr.parse_args_with(Punctuated::<Meta, Token![,]>::parse_terminated) {
            Ok(punctuated) => punctuated,
            Err(e) => {
                attr.meta
                    .span()
                    .unwrap()
                    .error(format!("failed to parse task_storage attribute: {e}"))
                    .emit();
                continue;
            }
        };

        for meta in nested {
            match &meta {
                Meta::NameValue(nv) => {
                    let Some(ident) = nv.path.get_ident() else {
                        continue;
                    };

                    if *ident == "storage" {
                        if let syn::Expr::Lit(syn::ExprLit {
                            lit: syn::Lit::Str(lit_str),
                            ..
                        }) = &nv.value
                        {
                            storage_type = match lit_str.value().as_str() {
                                "direct" => StorageType::Direct,
                                "auto_set" => StorageType::AutoSet,
                                "counter_map" => StorageType::CounterMap,
                                "indexed_vec" => StorageType::IndexedVec,
                                other => {
                                    meta.span()
                                        .unwrap()
                                        .error(format!("unknown storage type: {other}"))
                                        .emit();
                                    continue;
                                }
                            };
                        }
                    } else if *ident == "category" {
                        if let syn::Expr::Lit(syn::ExprLit {
                            lit: syn::Lit::Str(lit_str),
                            ..
                        }) = &nv.value
                        {
                            category = match lit_str.value().as_str() {
                                "data" => Category::Data,
                                "meta" => Category::Meta,
                                other => {
                                    meta.span()
                                        .unwrap()
                                        .error(format!("unknown category: {other}"))
                                        .emit();
                                    continue;
                                }
                            };
                        }
                    } else if *ident == "group"
                        && let syn::Expr::Lit(syn::ExprLit {
                            lit: syn::Lit::Str(lit_str),
                            ..
                        }) = &nv.value
                    {
                        group = Some(lit_str.value());
                    }
                }
                Meta::Path(path) => {
                    if let Some(ident) = path.get_ident() {
                        if *ident == "lazy" {
                            lazy = true;
                        } else if *ident == "specialized" {
                            specialized = true;
                        }
                    }
                }
                _ => {}
            }
        }
    }

    StorageFieldAttributes {
        field_name,
        field_type,
        storage_type,
        category,
        group,
        lazy,
        specialized,
    }
}

#[derive(Debug)]
struct GroupedFields {
    data_groups: Vec<FieldGroup>,
    meta_groups: Vec<FieldGroup>,
    specialized_data_fields: Vec<StorageFieldAttributes>,
    specialized_meta_fields: Vec<StorageFieldAttributes>,
}

#[derive(Debug)]
struct FieldGroup {
    name: String,
    fields: Vec<StorageFieldAttributes>,
    lazy: bool,
}

fn group_fields(fields: &[StorageFieldAttributes]) -> GroupedFields {
    use std::collections::HashMap;

    let mut data_groups_map: HashMap<String, Vec<StorageFieldAttributes>> = HashMap::new();
    let mut meta_groups_map: HashMap<String, Vec<StorageFieldAttributes>> = HashMap::new();
    let mut specialized_data_fields = Vec::new();
    let mut specialized_meta_fields = Vec::new();

    for field in fields {
        // Specialized fields are stored directly, not in groups
        if field.specialized {
            match field.category {
                Category::Data => specialized_data_fields.push(field.clone()),
                Category::Meta => specialized_meta_fields.push(field.clone()),
            }
            continue;
        }

        let group_name = field
            .group
            .clone()
            .unwrap_or_else(|| field.field_name.to_string());

        let map = match field.category {
            Category::Data => &mut data_groups_map,
            Category::Meta => &mut meta_groups_map,
        };

        map.entry(group_name).or_default().push(field.clone());
    }

    let data_groups = data_groups_map
        .into_iter()
        .map(|(name, fields)| {
            let lazy = fields.first().map(|f| f.lazy).unwrap_or(false);
            // Ensure all fields in a group have the same lazy setting
            for f in &fields {
                if f.lazy != lazy {
                    f.field_name
                        .span()
                        .unwrap()
                        .warning("inconsistent lazy annotation within group")
                        .emit();
                }
            }
            FieldGroup { name, fields, lazy }
        })
        .collect();

    let meta_groups = meta_groups_map
        .into_iter()
        .map(|(name, fields)| {
            let lazy = fields.first().map(|f| f.lazy).unwrap_or(false);
            for f in &fields {
                if f.lazy != lazy {
                    f.field_name
                        .span()
                        .unwrap()
                        .warning("inconsistent lazy annotation within group")
                        .emit();
                }
            }
            FieldGroup { name, fields, lazy }
        })
        .collect();

    GroupedFields {
        data_groups,
        meta_groups,
        specialized_data_fields,
        specialized_meta_fields,
    }
}

fn generate_task_storage_impl(_ident: &Ident, grouped_fields: &GroupedFields) -> TokenStream {
    // Generate group structs for data category
    let data_group_structs = generate_group_structs(&grouped_fields.data_groups, "Data");

    // Generate group structs for meta category
    let meta_group_structs = generate_group_structs(&grouped_fields.meta_groups, "Meta");

    // Generate the main TaskData struct
    let task_data_struct = generate_task_data_struct(
        &grouped_fields.data_groups,
        &grouped_fields.specialized_data_fields,
    );

    // Generate the main TaskMeta struct
    let task_meta_struct = generate_task_meta_struct(
        &grouped_fields.meta_groups,
        &grouped_fields.specialized_meta_fields,
    );

    // Generate the InnerStorage struct
    let inner_storage_struct = generate_inner_storage_struct();

    // Generate the InnerStorageSnapshot struct
    let snapshot_struct = generate_snapshot_struct();

    // Generate accessor methods
    let accessor_methods = generate_accessor_methods(grouped_fields);

    // Generate snapshot methods
    let snapshot_methods = generate_snapshot_methods();

    let expanded = quote! {
        // Generated group data structures
        #data_group_structs

        // Generated group meta structures
        #meta_group_structs

        // Generated TaskData struct
        #task_data_struct

        // Generated TaskMeta struct
        #task_meta_struct

        // Generated InnerStorage struct
        #inner_storage_struct

        // Generated InnerStorageSnapshot struct
        #snapshot_struct

        // Generated accessor methods
        #accessor_methods

        // Generated snapshot methods
        #snapshot_methods
    };

    TokenStream::from(expanded)
}

fn generate_group_structs(
    groups: &[FieldGroup],
    category_suffix: &str,
) -> proc_macro2::TokenStream {
    let mut output = proc_macro2::TokenStream::new();

    for group in groups {
        // Skip single-field groups that don't need a struct
        if group.fields.len() == 1 && !group.lazy {
            continue;
        }

        // Generate struct name from group name
        let struct_name = syn::Ident::new(
            &format!("{}{}Group", capitalize(&group.name), category_suffix),
            proc_macro2::Span::call_site(),
        );

        // Generate fields
        let field_defs: Vec<_> = group
            .fields
            .iter()
            .map(|f| {
                let field_name = &f.field_name;
                let field_type = &f.field_type;
                quote! {
                    pub #field_name: #field_type
                }
            })
            .collect();

        output.extend(quote! {
            #[derive(Debug, Clone, Default, bincode::Encode, bincode::Decode)]
            pub struct #struct_name {
                #(#field_defs),*
            }
        });
    }

    output
}

fn generate_task_data_struct(
    groups: &[FieldGroup],
    specialized_fields: &[StorageFieldAttributes],
) -> proc_macro2::TokenStream {
    let mut specialized_field_defs = Vec::new();
    let mut direct_fields = Vec::new();
    let mut group_fields = Vec::new();

    // Add specialized fields first (for memory layout optimization)
    for field in specialized_fields {
        let field_name = &field.field_name;
        let field_type = &field.field_type;
        specialized_field_defs.push(quote! {
            pub #field_name: #field_type
        });
    }

    for group in groups {
        if group.fields.len() == 1 && !group.lazy {
            // Direct field
            let field = &group.fields[0];
            let field_name = &field.field_name;
            let field_type = &field.field_type;
            direct_fields.push(quote! {
                pub #field_name: #field_type
            });
        } else {
            // Group field
            let group_name = syn::Ident::new(&group.name, proc_macro2::Span::call_site());
            let struct_name = syn::Ident::new(
                &format!("{}DataGroup", capitalize(&group.name)),
                proc_macro2::Span::call_site(),
            );

            if group.lazy {
                group_fields.push(quote! {
                    pub #group_name: Option<Box<#struct_name>>
                });
            } else {
                group_fields.push(quote! {
                    pub #group_name: #struct_name
                });
            }
        }
    }

    quote! {
        #[derive(Debug, Clone, Default, bincode::Encode, bincode::Decode)]
        pub struct TaskData {
            #(#specialized_field_defs,)*
            #(#direct_fields,)*
            #(#group_fields),*
        }
    }
}

fn generate_task_meta_struct(
    groups: &[FieldGroup],
    specialized_fields: &[StorageFieldAttributes],
) -> proc_macro2::TokenStream {
    let mut specialized_field_defs = Vec::new();
    let mut direct_fields = Vec::new();
    let mut group_fields = Vec::new();

    // Add specialized fields first (for memory layout optimization)
    for field in specialized_fields {
        let field_name = &field.field_name;
        let field_type = &field.field_type;
        specialized_field_defs.push(quote! {
            pub #field_name: #field_type
        });
    }

    for group in groups {
        if group.fields.len() == 1 && !group.lazy {
            // Direct field
            let field = &group.fields[0];
            let field_name = &field.field_name;
            let field_type = &field.field_type;
            direct_fields.push(quote! {
                pub #field_name: #field_type
            });
        } else {
            // Group field
            let group_name = syn::Ident::new(&group.name, proc_macro2::Span::call_site());
            let struct_name = syn::Ident::new(
                &format!("{}MetaGroup", capitalize(&group.name)),
                proc_macro2::Span::call_site(),
            );

            if group.lazy {
                group_fields.push(quote! {
                    pub #group_name: Option<Box<#struct_name>>
                });
            } else {
                group_fields.push(quote! {
                    pub #group_name: #struct_name
                });
            }
        }
    }

    quote! {
        #[derive(Debug, Clone, Default, bincode::Encode, bincode::Decode)]
        pub struct TaskMeta {
            #(#specialized_field_defs,)*
            #(#direct_fields,)*
            #(#group_fields),*
        }
    }
}

fn generate_inner_storage_struct() -> proc_macro2::TokenStream {
    quote! {
        #[derive(Debug, Clone)]
        pub struct InnerStorage {
            pub data: TaskData,
            pub meta: TaskMeta,
            state: InnerStorageState,
        }

        impl InnerStorage {
            pub fn new() -> Self {
                Self {
                    data: TaskData::default(),
                    meta: TaskMeta::default(),
                    state: InnerStorageState::default(),
                }
            }

            pub fn state(&self) -> &InnerStorageState {
                &self.state
            }

            pub fn state_mut(&mut self) -> &mut InnerStorageState {
                &mut self.state
            }
        }

        impl Default for InnerStorage {
            fn default() -> Self {
                Self::new()
            }
        }
    }
}

fn generate_accessor_methods(grouped_fields: &GroupedFields) -> proc_macro2::TokenStream {
    let mut methods = proc_macro2::TokenStream::new();

    // Generate methods for specialized data fields
    for field in &grouped_fields.specialized_data_fields {
        methods.extend(generate_specialized_field_accessors(field, "data"));
    }

    // Generate methods for specialized meta fields
    for field in &grouped_fields.specialized_meta_fields {
        methods.extend(generate_specialized_field_accessors(field, "meta"));
    }

    // Generate methods for data fields
    for group in &grouped_fields.data_groups {
        methods.extend(generate_group_accessors(group, "data"));
    }

    // Generate methods for meta fields
    for group in &grouped_fields.meta_groups {
        methods.extend(generate_group_accessors(group, "meta"));
    }

    quote! {
        impl InnerStorage {
            #methods
        }
    }
}

fn generate_group_accessors(group: &FieldGroup, category: &str) -> proc_macro2::TokenStream {
    let mut methods = proc_macro2::TokenStream::new();
    let category_ident = syn::Ident::new(category, proc_macro2::Span::call_site());

    for field in &group.fields {
        let field_name = &field.field_name;
        let field_type = &field.field_type;

        // Determine the path to the field based on grouping
        let field_path = if group.fields.len() == 1 && !group.lazy {
            // Direct field
            quote! { self.#category_ident.#field_name }
        } else {
            // Grouped field
            let group_name = syn::Ident::new(&group.name, proc_macro2::Span::call_site());
            quote! {
                self.#category_ident.#group_name.as_ref()?.#field_name
            }
        };

        let field_path_mut = if group.fields.len() == 1 && !group.lazy {
            // Direct field
            quote! { &mut self.#category_ident.#field_name }
        } else {
            // Grouped field with lazy allocation
            let group_name = syn::Ident::new(&group.name, proc_macro2::Span::call_site());
            let group_struct = syn::Ident::new(
                &format!(
                    "{}{}Group",
                    capitalize(&group.name),
                    if category == "data" { "Data" } else { "Meta" }
                ),
                proc_macro2::Span::call_site(),
            );
            quote! {
                &mut self.#category_ident.#group_name
                    .get_or_insert_with(|| Box::new(#group_struct::default()))
                    .#field_name
            }
        };

        // Determine modification tracking method based on category
        let set_modified = if category == "data" {
            quote! { self.state.set_data_modified(true); }
        } else {
            quote! { self.state.set_meta_modified(true); }
        };

        // Generate appropriate accessors based on storage type
        match field.storage_type {
            StorageType::Direct => {
                // Simple get/set for direct types (already Option<T>)
                let get_name = syn::Ident::new(
                    &format!("get_{}", field_name),
                    proc_macro2::Span::call_site(),
                );
                let set_name = syn::Ident::new(
                    &format!("set_{}", field_name),
                    proc_macro2::Span::call_site(),
                );

                methods.extend(quote! {
                    pub fn #get_name(&self) -> &#field_type {
                        &#field_path
                    }

                    pub fn #set_name(&mut self, value: #field_type) {
                        *#field_path_mut = value;
                        #set_modified
                    }
                });
            }
            StorageType::AutoSet => {
                // Just provide direct access to the AutoSet via mutable reference
                // Note: Modification tracking happens when mutable reference is obtained
                let get_name = syn::Ident::new(
                    &format!("{}_mut", field_name),
                    proc_macro2::Span::call_site(),
                );

                methods.extend(quote! {
                    pub fn #get_name(&mut self) -> &mut #field_type {
                        #set_modified
                        #field_path_mut
                    }
                });
            }
            StorageType::CounterMap => {
                // Provide direct mutable access to CounterMap
                let get_name = syn::Ident::new(
                    &format!("{}_mut", field_name),
                    proc_macro2::Span::call_site(),
                );

                methods.extend(quote! {
                    pub fn #get_name(&mut self) -> &mut #field_type {
                        #set_modified
                        #field_path_mut
                    }
                });
            }
            StorageType::IndexedVec => {
                // Provide direct mutable access to IndexedVec
                let get_name = syn::Ident::new(
                    &format!("{}_mut", field_name),
                    proc_macro2::Span::call_site(),
                );

                methods.extend(quote! {
                    pub fn #get_name(&mut self) -> &mut #field_type {
                        #set_modified
                        #field_path_mut
                    }
                });
            }
        }
    }

    methods
}

fn generate_specialized_field_accessors(
    field: &StorageFieldAttributes,
    category: &str,
) -> proc_macro2::TokenStream {
    let mut methods = proc_macro2::TokenStream::new();
    let category_ident = syn::Ident::new(category, proc_macro2::Span::call_site());
    let field_name = &field.field_name;
    let field_type = &field.field_type;

    // Determine modification tracking method based on category
    let set_modified = if category == "data" {
        quote! { self.state.set_data_modified(true); }
    } else {
        quote! { self.state.set_meta_modified(true); }
    };

    // Specialized fields are always direct access at the top level of TaskData/TaskMeta
    let field_path = quote! { self.#category_ident.#field_name };
    let field_path_mut = quote! { &mut self.#category_ident.#field_name };

    // Generate appropriate accessors based on storage type
    match field.storage_type {
        StorageType::Direct => {
            let get_name = syn::Ident::new(
                &format!("get_{}", field_name),
                proc_macro2::Span::call_site(),
            );
            let set_name = syn::Ident::new(
                &format!("set_{}", field_name),
                proc_macro2::Span::call_site(),
            );

            methods.extend(quote! {
                pub fn #get_name(&self) -> &#field_type {
                    &#field_path
                }

                pub fn #set_name(&mut self, value: #field_type) {
                    *#field_path_mut = value;
                    #set_modified
                }
            });
        }
        StorageType::AutoSet | StorageType::CounterMap | StorageType::IndexedVec => {
            let get_name = syn::Ident::new(
                &format!("{}_mut", field_name),
                proc_macro2::Span::call_site(),
            );

            methods.extend(quote! {
                pub fn #get_name(&mut self) -> &mut #field_type {
                    #set_modified
                    #field_path_mut
                }
            });
        }
    }

    methods
}

fn generate_snapshot_struct() -> proc_macro2::TokenStream {
    quote! {
        #[derive(Debug, Clone)]
        pub struct InnerStorageSnapshot {
            pub data: TaskData,
            pub meta: TaskMeta,
            pub data_modified: bool,
            pub meta_modified: bool,
        }
    }
}

fn generate_snapshot_methods() -> proc_macro2::TokenStream {
    quote! {
        impl InnerStorage {
            /// Creates a snapshot of the current storage state
            pub fn snapshot(&self) -> InnerStorageSnapshot {
                InnerStorageSnapshot {
                    data: self.data.clone(),
                    meta: self.meta.clone(),
                    data_modified: self.state.data_modified(),
                    meta_modified: self.state.meta_modified(),
                }
            }

            /// Restores the storage from a snapshot
            pub fn restore(&mut self, snapshot: InnerStorageSnapshot) {
                self.data = snapshot.data;
                self.meta = snapshot.meta;
                self.state.set_data_modified(snapshot.data_modified);
                self.state.set_meta_modified(snapshot.meta_modified);
            }
        }
    }
}

fn capitalize(s: &str) -> String {
    let mut c = s.chars();
    match c.next() {
        None => String::new(),
        Some(f) => f.to_uppercase().collect::<String>() + c.as_str(),
    }
}
