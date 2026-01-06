use proc_macro::TokenStream;
use quote::quote;
use syn::{
    Data, DeriveInput, Fields, Ident, Meta, Token, Type, parse_macro_input, punctuated::Punctuated,
    spanned::Spanned,
};

/// Derives the TaskStorage trait and generates optimized storage structures.
///
/// This macro analyzes field annotations and generates:
/// 1. A unified TypedStorage struct
/// 2. LazyField enum for lazy_vec fields
/// 3. Typed accessor methods on TypedStorage
/// 4. TaskStorageAccessors trait with accessor methods
/// 5. TaskFlags bitfield for boolean flags
///
/// # Field Attributes
///
/// - `#[task_storage(storage = "...")]` - Specifies the storage type:
///   - `direct` - Direct field access (e.g., `Option<OutputValue>`)
///   - `auto_set` - Uses AutoSet for small collections
///   - `auto_map` - Uses AutoMap for key-value pairs
///   - `counter_map` - Uses CounterMap for reference counting
///   - `indexed_vec` - Uses IndexedVec for direct index access
///
/// - `#[task_storage(category = "...")]` - Data vs Meta categorization:
///   - `data` - Frequently changed, bulk I/O
///   - `meta` - Rarely changed, small I/O
///
/// - `#[task_storage(lazy)]` - Field is lazily allocated in a Vec<LazyField> for memory efficiency.
///   Fields without `lazy` are stored inline.
///
/// - `#[task_storage(transient)]` - Field is not serialized
///
/// - `#[task_storage(flag)]` - Field is a boolean flag stored in a bitfield. The field type must be
///   `bool`. Flags are stored in a compact `TaskFlags` bitfield.
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
    /// If true, field is lazily allocated in Vec<LazyField> instead of inline on TypedStorage
    lazy: bool,
    /// If true, field is not serialized (skipped in bincode)
    transient: bool,
    /// If true, field is a boolean flag stored in the TaskFlags bitfield
    flag: bool,
}

#[derive(Debug, Clone, PartialEq, Eq)]
enum StorageType {
    Direct,
    AutoSet,
    AutoMap,
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
    let mut lazy = false;
    let mut transient = false;
    let mut flag = false;

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
                                "auto_map" => StorageType::AutoMap,
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
                    }
                }
                Meta::Path(path) => {
                    if let Some(ident) = path.get_ident() {
                        if *ident == "lazy" {
                            lazy = true;
                        } else if *ident == "transient" {
                            transient = true;
                        } else if *ident == "flag" {
                            flag = true;
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
        lazy,
        transient,
        flag,
    }
}

#[derive(Debug)]
struct GroupedFields {
    /// Inline fields stored directly on TypedStorage (data category)
    inline_data_fields: Vec<StorageFieldAttributes>,
    /// Inline fields stored directly on TypedStorage (meta category)
    inline_meta_fields: Vec<StorageFieldAttributes>,
    /// Lazy fields stored in Vec<LazyField> (data category)
    lazy_data_fields: Vec<StorageFieldAttributes>,
    /// Lazy fields stored in Vec<LazyField> (meta category)
    lazy_meta_fields: Vec<StorageFieldAttributes>,
    /// Flag fields stored in TaskFlags bitfield (persisted flags)
    persisted_flag_fields: Vec<StorageFieldAttributes>,
    /// Flag fields stored in TaskFlags bitfield (transient flags)
    transient_flag_fields: Vec<StorageFieldAttributes>,
}

fn group_fields(fields: &[StorageFieldAttributes]) -> GroupedFields {
    let mut inline_data_fields = Vec::new();
    let mut inline_meta_fields = Vec::new();
    let mut lazy_data_fields = Vec::new();
    let mut lazy_meta_fields = Vec::new();
    let mut persisted_flag_fields = Vec::new();
    let mut transient_flag_fields = Vec::new();

    for field in fields {
        if field.flag {
            // Flag fields are stored in TaskFlags bitfield
            if field.transient {
                transient_flag_fields.push(field.clone());
            } else {
                persisted_flag_fields.push(field.clone());
            }
        } else if field.lazy {
            // Lazy fields are stored in Vec<LazyField>
            match field.category {
                Category::Data => lazy_data_fields.push(field.clone()),
                Category::Meta => lazy_meta_fields.push(field.clone()),
            }
        } else {
            // Non-lazy fields are stored inline on TypedStorage
            match field.category {
                Category::Data => inline_data_fields.push(field.clone()),
                Category::Meta => inline_meta_fields.push(field.clone()),
            }
        }
    }

    GroupedFields {
        inline_data_fields,
        inline_meta_fields,
        lazy_data_fields,
        lazy_meta_fields,
        persisted_flag_fields,
        transient_flag_fields,
    }
}

fn generate_task_storage_impl(_ident: &Ident, grouped_fields: &GroupedFields) -> TokenStream {
    // Generate TaskFlags bitfield if there are flag fields
    let task_flags_bitfield = generate_task_flags_bitfield(grouped_fields);

    // Generate LazyField enum for lazy fields
    let lazy_field_enum = generate_lazy_field_enum(grouped_fields);

    // Generate the unified TypedStorage struct
    let typed_storage_struct = generate_typed_storage_struct(grouped_fields);

    // Generate accessor methods
    let accessor_methods = generate_accessor_methods(grouped_fields);

    // Generate TaskStorageAccessors trait for all fields
    let accessors_trait = generate_task_storage_accessors_trait(grouped_fields);

    // Generate encode/decode methods for serialization
    let encode_decode_methods = generate_encode_decode_methods(grouped_fields);

    // Generate snapshot clone and merge methods
    let snapshot_merge_methods = generate_snapshot_merge_methods(grouped_fields);

    let expanded = quote! {
        // Generated TaskFlags bitfield
        #task_flags_bitfield

        // Generated LazyField enum
        #lazy_field_enum

        // Generated TypedStorage struct (unified)
        #typed_storage_struct

        // Generated accessor methods
        #accessor_methods

        // Generated encode/decode methods
        #encode_decode_methods

        // Generated snapshot clone and merge methods
        #snapshot_merge_methods

        // Generated TaskStorageAccessors trait
        #accessors_trait
    };

    TokenStream::from(expanded)
}

/// Generate the TaskFlags bitfield using the bitfield crate.
///
/// Persisted flags come first (bits 0-N), then transient flags (bits N+1-M).
/// This allows serializing only the persisted portion.
fn generate_task_flags_bitfield(grouped_fields: &GroupedFields) -> proc_macro2::TokenStream {
    let all_flags: Vec<_> = grouped_fields
        .persisted_flag_fields
        .iter()
        .chain(grouped_fields.transient_flag_fields.iter())
        .collect();

    // If no flags, don't generate the bitfield
    if all_flags.is_empty() {
        return quote! {};
    }

    let persisted_count = grouped_fields.persisted_flag_fields.len();

    // Generate bitfield accessors
    // Format: pub field_name, set_field_name: bit_index;
    let bitfield_accessors: Vec<_> = all_flags
        .iter()
        .enumerate()
        .map(|(i, field)| {
            let field_name = &field.field_name;
            let set_name = syn::Ident::new(
                &format!("set_{}", field_name),
                proc_macro2::Span::call_site(),
            );
            // bitfield crate uses usize for bit indices, but literal integers work fine
            let bit_idx = i;
            quote! {
                pub #field_name, #set_name: #bit_idx
            }
        })
        .collect();

    // Generate the persisted bits mask
    let persisted_mask = (1u16 << persisted_count) - 1;

    quote! {
        bitfield::bitfield! {
            /// Combined bitfield for task flags.
            /// Persisted flags are in the lower bits (0 to N-1).
            /// Transient flags are in the higher bits (N and above).
            #[derive(Clone, Default)]
            pub struct TaskFlags(u16);
            impl Debug;

            #(#bitfield_accessors;)*
        }

        impl TaskFlags {
            /// Mask for persisted flags (lower bits only)
            pub const PERSISTED_MASK: u16 = #persisted_mask;

            /// Get the raw bits value
            pub fn bits(&self) -> u16 {
                self.0
            }

            /// Get only the persisted bits (for serialization)
            pub fn persisted_bits(&self) -> u16 {
                self.0 & Self::PERSISTED_MASK
            }

            /// Set bits from a raw value, preserving transient flags
            pub fn set_persisted_bits(&mut self, bits: u16) {
                self.0 = (self.0 & !Self::PERSISTED_MASK) | (bits & Self::PERSISTED_MASK);
            }

            /// Create from raw bits (for deserialization)
            pub fn from_bits(bits: u16) -> Self {
                Self(bits)
            }
        }
    }
}

/// Generate the LazyField enum containing all lazy fields
fn generate_lazy_field_enum(grouped_fields: &GroupedFields) -> proc_macro2::TokenStream {
    let all_lazy_fields: Vec<_> = grouped_fields
        .lazy_data_fields
        .iter()
        .chain(grouped_fields.lazy_meta_fields.iter())
        .collect();

    // If no lazy_vec fields, don't generate the enum
    if all_lazy_fields.is_empty() {
        return quote! {};
    }

    // Generate enum variants
    let variants: Vec<_> = all_lazy_fields
        .iter()
        .map(|field| {
            let variant_name = syn::Ident::new(
                &to_pascal_case(&field.field_name.to_string()),
                field.field_name.span(),
            );
            let field_type = &field.field_type;
            quote! {
                #variant_name(#field_type)
            }
        })
        .collect();

    // Generate is_empty method arms
    let is_empty_arms: Vec<_> = all_lazy_fields
        .iter()
        .map(|field| {
            let variant_name = syn::Ident::new(
                &to_pascal_case(&field.field_name.to_string()),
                field.field_name.span(),
            );
            // For collection types, check if empty; for Option-like types, presence means non-empty
            match field.storage_type {
                StorageType::Direct => {
                    // For Option<T> types, presence of the variant means it's non-empty
                    quote! {
                        LazyField::#variant_name(_) => false
                    }
                }
                _ => {
                    // For collection types, delegate to is_empty()
                    quote! {
                        LazyField::#variant_name(v) => v.is_empty()
                    }
                }
            }
        })
        .collect();

    // Generate is_persistent (transient check) method arms
    let is_persistent_arms: Vec<_> = all_lazy_fields
        .iter()
        .map(|field| {
            let variant_name = syn::Ident::new(
                &to_pascal_case(&field.field_name.to_string()),
                field.field_name.span(),
            );
            let is_persistent = !field.transient;
            quote! {
                LazyField::#variant_name(_) => #is_persistent
            }
        })
        .collect();

    // Generate is_meta/is_data method arms
    let is_meta_arms: Vec<_> = all_lazy_fields
        .iter()
        .map(|field| {
            let variant_name = syn::Ident::new(
                &to_pascal_case(&field.field_name.to_string()),
                field.field_name.span(),
            );
            let is_meta = field.category == Category::Meta;
            quote! {
                LazyField::#variant_name(_) => #is_meta
            }
        })
        .collect();

    // Generate discriminant method arms
    let discriminant_arms: Vec<_> = all_lazy_fields
        .iter()
        .enumerate()
        .map(|(i, field)| {
            let variant_name = syn::Ident::new(
                &to_pascal_case(&field.field_name.to_string()),
                field.field_name.span(),
            );
            let idx = i as u8;
            quote! {
                LazyField::#variant_name(_) => #idx
            }
        })
        .collect();

    quote! {
        /// All lazily-allocated fields stored in a single Vec.
        /// Fields are stored directly (unboxed) to avoid allocation overhead.
        #[derive(Debug, Clone)]
        pub enum LazyField {
            #(#variants),*
        }

        impl LazyField {
            /// Returns true if this field is empty (can be removed from the Vec)
            pub fn is_empty(&self) -> bool {
                match self {
                    #(#is_empty_arms),*
                }
            }

            /// Returns true if this field should be persisted (not transient)
            pub fn is_persistent(&self) -> bool {
                match self {
                    #(#is_persistent_arms),*
                }
            }

            /// Returns true if this field belongs to the meta category
            pub fn is_meta(&self) -> bool {
                match self {
                    #(#is_meta_arms),*
                }
            }

            /// Returns true if this field belongs to the data category
            pub fn is_data(&self) -> bool {
                !self.is_meta()
            }

            /// Get discriminant value for serialization
            pub fn discriminant(&self) -> u8 {
                match self {
                    #(#discriminant_arms),*
                }
            }
        }
    }
}

/// Generate the unified TypedStorage struct with all fields directly on it.
fn generate_typed_storage_struct(grouped_fields: &GroupedFields) -> proc_macro2::TokenStream {
    let has_lazy =
        !grouped_fields.lazy_data_fields.is_empty() || !grouped_fields.lazy_meta_fields.is_empty();
    let has_flags = !grouped_fields.persisted_flag_fields.is_empty()
        || !grouped_fields.transient_flag_fields.is_empty();

    // Collect all field definitions from both categories
    let mut field_defs = Vec::new();

    // Add inline fields directly on TypedStorage
    // Note: No bincode attributes since we don't derive Encode/Decode (manual serialization)
    for field in grouped_fields
        .inline_data_fields
        .iter()
        .chain(grouped_fields.inline_meta_fields.iter())
    {
        let field_name = &field.field_name;
        let field_type = &field.field_type;
        field_defs.push(quote! {
            pub #field_name: #field_type
        });
    }

    // Add flags bitfield if needed
    let flags_field = if has_flags {
        quote! {
            /// Combined bitfield for boolean flags (persisted + transient)
            pub flags: TaskFlags,
        }
    } else {
        quote! {}
    };

    // Add lazy vec field if needed
    // Note: Serialization is handled manually via encode_data/encode_meta methods
    let lazy_field = if has_lazy {
        quote! {
            /// Lazily-allocated fields stored in a single Vec for memory efficiency
            pub lazy: Vec<LazyField>,
        }
    } else {
        quote! {}
    };

    let lazy_helpers = if has_lazy {
        quote! {
            /// Find a lazy field by predicate (immutable)
            pub fn find_lazy<T>(&self, extract: impl Fn(&LazyField) -> Option<&T>) -> Option<&T> {
                self.lazy.iter().find_map(extract)
            }

            /// Find a lazy field by predicate (mutable)
            pub fn find_lazy_mut<T>(&mut self, extract: impl Fn(&mut LazyField) -> Option<&mut T>) -> Option<&mut T> {
                self.lazy.iter_mut().find_map(extract)
            }

            /// Get or create a lazy field, returning a mutable reference
            pub fn get_or_create_lazy<T>(
                &mut self,
                check: impl Fn(&LazyField) -> bool,
                extract: impl Fn(&mut LazyField) -> Option<&mut T>,
                create: impl FnOnce() -> LazyField,
            ) -> &mut T {
                let idx = self.lazy.iter().position(|f| check(f));
                if let Some(idx) = idx {
                    extract(&mut self.lazy[idx]).unwrap()
                } else {
                    self.lazy.push(create());
                    extract(self.lazy.last_mut().unwrap()).unwrap()
                }
            }

            /// Remove a lazy field at index if it's empty
            pub fn remove_if_empty(&mut self, idx: usize) {
                if self.lazy[idx].is_empty() {
                    self.lazy.swap_remove(idx);
                }
            }
        }
    } else {
        quote! {}
    };

    // Note: We don't derive bincode::Encode/Decode here since serialization
    // will be handled manually via encode_data/encode_meta/decode_data/decode_meta methods
    quote! {
        /// Unified typed storage containing all task fields.
        /// This is designed to be embedded in the actual InnerStorage for incremental migration.
        #[derive(Debug, Clone, Default)]
        pub struct TypedStorage {
            #(#field_defs,)*
            #flags_field
            #lazy_field
        }

        impl TypedStorage {
            pub fn new() -> Self {
                Self::default()
            }

            #lazy_helpers
        }
    }
}

fn generate_accessor_methods(grouped_fields: &GroupedFields) -> proc_macro2::TokenStream {
    let mut methods = proc_macro2::TokenStream::new();

    // Generate methods for inline fields (both data and meta)
    for field in grouped_fields
        .inline_data_fields
        .iter()
        .chain(grouped_fields.inline_meta_fields.iter())
    {
        methods.extend(generate_inline_field_accessors(field));
    }

    // Generate methods for lazy_vec fields
    for field in grouped_fields
        .lazy_data_fields
        .iter()
        .chain(grouped_fields.lazy_meta_fields.iter())
    {
        methods.extend(generate_lazy_field_accessors(field));
    }

    quote! {
        impl TypedStorage {
            #methods
        }
    }
}

/// Generate accessor methods for an inline field (stored directly on TypedStorage)
fn generate_inline_field_accessors(field: &StorageFieldAttributes) -> proc_macro2::TokenStream {
    let field_name = &field.field_name;
    let field_type = &field.field_type;

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

            quote! {
                pub fn #get_name(&self) -> &#field_type {
                    &self.#field_name
                }

                pub fn #set_name(&mut self, value: #field_type) {
                    self.#field_name = value;
                }
            }
        }
        StorageType::AutoSet
        | StorageType::AutoMap
        | StorageType::CounterMap
        | StorageType::IndexedVec => {
            // Provide direct mutable access for collection types
            let mut_name = syn::Ident::new(
                &format!("{}_mut", field_name),
                proc_macro2::Span::call_site(),
            );

            quote! {
                pub fn #mut_name(&mut self) -> &mut #field_type {
                    &mut self.#field_name
                }
            }
        }
    }
}

/// Generate accessor methods for a lazy field (stored in Vec<LazyField>)
fn generate_lazy_field_accessors(field: &StorageFieldAttributes) -> proc_macro2::TokenStream {
    let field_name = &field.field_name;
    let field_type = &field.field_type;
    let variant_name = syn::Ident::new(
        &to_pascal_case(&field.field_name.to_string()),
        field.field_name.span(),
    );

    match field.storage_type {
        StorageType::Direct => {
            // For Option<T> types with lazy_vec, generate Option-like accessors
            let get_name = syn::Ident::new(
                &format!("get_{}", field_name),
                proc_macro2::Span::call_site(),
            );
            let set_name = syn::Ident::new(
                &format!("set_{}", field_name),
                proc_macro2::Span::call_site(),
            );
            let take_name = syn::Ident::new(
                &format!("take_{}", field_name),
                proc_macro2::Span::call_site(),
            );

            quote! {
                pub fn #get_name(&self) -> Option<&#field_type> {
                    self.find_lazy(|f| match f {
                        LazyField::#variant_name(v) => Some(v),
                        _ => None,
                    })
                }

                pub fn #set_name(&mut self, value: #field_type) {
                    // Remove existing if any, then add new
                    self.lazy.retain(|f| !matches!(f, LazyField::#variant_name(_)));
                    self.lazy.push(LazyField::#variant_name(value));
                }

                pub fn #take_name(&mut self) -> Option<#field_type> {
                    let idx = self.lazy.iter().position(|f| matches!(f, LazyField::#variant_name(_)))?;
                    match self.lazy.swap_remove(idx) {
                        LazyField::#variant_name(v) => Some(v),
                        _ => unreachable!(),
                    }
                }
            }
        }
        _ => {
            // For collection types, generate get (Option<&T>) and get_mut (&mut T)
            let ref_name =
                syn::Ident::new(&format!("{}", field_name), proc_macro2::Span::call_site());
            let mut_name = syn::Ident::new(
                &format!("{}_mut", field_name),
                proc_macro2::Span::call_site(),
            );

            quote! {
                pub fn #ref_name(&self) -> Option<&#field_type> {
                    self.find_lazy(|f| match f {
                        LazyField::#variant_name(v) => Some(v),
                        _ => None,
                    })
                }

                pub fn #mut_name(&mut self) -> &mut #field_type {
                    self.get_or_create_lazy(
                        |f| matches!(f, LazyField::#variant_name(_)),
                        |f| match f {
                            LazyField::#variant_name(v) => Some(v),
                            _ => None,
                        },
                        || LazyField::#variant_name(Default::default()),
                    )
                }
            }
        }
    }
}

/// Generates the TaskStorageAccessors trait with accessor methods for all fields.
///
/// This trait provides:
/// 1. Required methods: `typed()` and `typed_mut(category)` that implementors must provide
/// 2. Provided methods: accessor methods for all fields
///
/// The trait is designed to be used with TaskGuard, which implements the required methods
/// and gets all the accessor methods for free.
fn generate_task_storage_accessors_trait(
    grouped_fields: &GroupedFields,
) -> proc_macro2::TokenStream {
    let mut trait_methods = proc_macro2::TokenStream::new();

    // Generate accessor methods for inline fields
    for field in &grouped_fields.inline_data_fields {
        trait_methods.extend(generate_inline_trait_accessor_methods(field, "data"));
    }
    for field in &grouped_fields.inline_meta_fields {
        trait_methods.extend(generate_inline_trait_accessor_methods(field, "meta"));
    }

    // Generate accessor methods for lazy_vec fields
    for field in &grouped_fields.lazy_data_fields {
        trait_methods.extend(generate_lazy_trait_accessor_methods(field));
    }
    for field in &grouped_fields.lazy_meta_fields {
        trait_methods.extend(generate_lazy_trait_accessor_methods(field));
    }

    // Generate accessor methods for flag fields (all flags are meta category)
    for field in grouped_fields
        .persisted_flag_fields
        .iter()
        .chain(grouped_fields.transient_flag_fields.iter())
    {
        trait_methods.extend(generate_flag_trait_accessor_methods(field));
    }

    quote! {
        /// Trait for typed storage accessors.
        ///
        /// This trait is auto-generated by the TaskStorage macro.
        /// Implementors only need to provide `typed()` and `typed_mut()` methods, and all
        /// accessor methods are provided automatically.
        ///
        /// This is designed to work with TaskGuard.
        pub trait TaskStorageAccessors {
            /// Access the typed storage (read-only)
            fn typed(&self) -> &TypedStorage;

            /// Access the typed storage (mutable) and track modification for the given category.
            /// The category parameter tells the implementation which category is being modified
            /// so it can track dirty state appropriately.
            fn typed_mut(&mut self, category: crate::backend::storage::SpecificTaskDataCategory) -> &mut TypedStorage;

            #trait_methods
        }
    }
}

/// Generates trait accessor methods for an inline field (stored directly on TypedStorage)
fn generate_inline_trait_accessor_methods(
    field: &StorageFieldAttributes,
    category: &str,
) -> proc_macro2::TokenStream {
    let field_name = &field.field_name;
    let field_type = &field.field_type;

    // Determine the category enum variant for typed_mut
    let category_variant = if category == "data" {
        quote! { crate::backend::storage::SpecificTaskDataCategory::Data }
    } else {
        quote! { crate::backend::storage::SpecificTaskDataCategory::Meta }
    };

    match field.storage_type {
        StorageType::Direct => {
            // For Option<T> fields, generate get_ref, has_, set_, take_ methods
            let get_ref_name = syn::Ident::new(
                &format!("get_{}_ref", field_name),
                proc_macro2::Span::call_site(),
            );
            let has_name = syn::Ident::new(
                &format!("has_{}", field_name),
                proc_macro2::Span::call_site(),
            );
            let set_name = syn::Ident::new(
                &format!("set_{}", field_name),
                proc_macro2::Span::call_site(),
            );
            let take_name = syn::Ident::new(
                &format!("take_{}", field_name),
                proc_macro2::Span::call_site(),
            );

            // Extract inner type from Option<T>
            let inner_type = extract_option_inner_type(field_type);

            quote! {
                /// Get a reference to the field value (if present)
                fn #get_ref_name(&self) -> Option<&#inner_type> {
                    self.typed().#field_name.as_ref()
                }

                /// Check if this field has a value
                fn #has_name(&self) -> bool {
                    self.typed().#field_name.is_some()
                }

                /// Set the field value, returning the old value if present
                fn #set_name(&mut self, value: #inner_type) -> Option<#inner_type> {
                    std::mem::replace(
                        &mut self.typed_mut(#category_variant).#field_name,
                        Some(value)
                    )
                }

                /// Take the field value, leaving None
                fn #take_name(&mut self) -> Option<#inner_type> {
                    self.typed_mut(#category_variant).#field_name.take()
                }
            }
        }
        StorageType::AutoSet
        | StorageType::AutoMap
        | StorageType::CounterMap
        | StorageType::IndexedVec => {
            // For collection types, generate immutable and mutable accessors
            let ref_name =
                syn::Ident::new(&format!("{}", field_name), proc_macro2::Span::call_site());
            let mut_name = syn::Ident::new(
                &format!("{}_mut", field_name),
                proc_macro2::Span::call_site(),
            );

            quote! {
                /// Get a reference to the collection
                fn #ref_name(&self) -> &#field_type {
                    &self.typed().#field_name
                }

                /// Get a mutable reference to the collection
                fn #mut_name(&mut self) -> &mut #field_type {
                    &mut self.typed_mut(#category_variant).#field_name
                }
            }
        }
    }
}

/// Extract the inner type from Option<T>
fn extract_option_inner_type(ty: &Type) -> proc_macro2::TokenStream {
    // Try to parse as Option<T> and extract T
    if let Type::Path(type_path) = ty {
        if let Some(segment) = type_path.path.segments.last() {
            if segment.ident == "Option" {
                if let syn::PathArguments::AngleBracketed(args) = &segment.arguments {
                    if let Some(syn::GenericArgument::Type(inner)) = args.args.first() {
                        return quote! { #inner };
                    }
                }
            }
        }
    }
    // Fallback: just use the whole type (shouldn't happen for properly annotated fields)
    quote! { #ty }
}

fn capitalize(s: &str) -> String {
    let mut c = s.chars();
    match c.next() {
        None => String::new(),
        Some(f) => f.to_uppercase().collect::<String>() + c.as_str(),
    }
}

/// Convert snake_case to PascalCase (e.g., "in_progress" -> "InProgress")
fn to_pascal_case(s: &str) -> String {
    s.split('_')
        .map(|word| capitalize(word))
        .collect::<String>()
}

/// Generate trait accessor methods for a lazy field (stored in Vec<LazyField>)
fn generate_lazy_trait_accessor_methods(
    field: &StorageFieldAttributes,
) -> proc_macro2::TokenStream {
    let field_name = &field.field_name;
    let field_type = &field.field_type;
    let variant_name = syn::Ident::new(
        &to_pascal_case(&field.field_name.to_string()),
        field.field_name.span(),
    );

    // Determine the category for typed_mut
    let category_variant = if field.category == Category::Meta {
        quote! { crate::backend::storage::SpecificTaskDataCategory::Meta }
    } else {
        quote! { crate::backend::storage::SpecificTaskDataCategory::Data }
    };

    match field.storage_type {
        StorageType::Direct => {
            // For Option<T> types with lazy_vec, generate Option-like trait accessors
            let get_ref_name = syn::Ident::new(
                &format!("get_{}_ref", field_name),
                proc_macro2::Span::call_site(),
            );
            let has_name = syn::Ident::new(
                &format!("has_{}", field_name),
                proc_macro2::Span::call_site(),
            );
            let set_name = syn::Ident::new(
                &format!("set_{}", field_name),
                proc_macro2::Span::call_site(),
            );
            let take_name = syn::Ident::new(
                &format!("take_{}", field_name),
                proc_macro2::Span::call_site(),
            );

            let inner_type = extract_option_inner_type(field_type);

            quote! {
                /// Get a reference to the field value (if present)
                fn #get_ref_name(&self) -> Option<&#inner_type> {
                    self.typed().find_lazy(|f| match f {
                        LazyField::#variant_name(v) => v.as_ref(),
                        _ => None,
                    })
                }

                /// Check if this field has a value
                fn #has_name(&self) -> bool {
                    self.typed().lazy.iter().any(|f| matches!(f, LazyField::#variant_name(Some(_))))
                }

                /// Set the field value, returning the old value if present
                fn #set_name(&mut self, value: #inner_type) -> Option<#inner_type> {
                    let typed = self.typed_mut(#category_variant);
                    // Find and remove existing
                    let old = typed.lazy.iter().position(|f| matches!(f, LazyField::#variant_name(_)))
                        .and_then(|idx| {
                            match typed.lazy.swap_remove(idx) {
                                LazyField::#variant_name(v) => v,
                                _ => None,
                            }
                        });
                    typed.lazy.push(LazyField::#variant_name(Some(value)));
                    old
                }

                /// Take the field value, leaving None
                fn #take_name(&mut self) -> Option<#inner_type> {
                    let typed = self.typed_mut(#category_variant);
                    typed.lazy.iter().position(|f| matches!(f, LazyField::#variant_name(_)))
                        .and_then(|idx| {
                            match typed.lazy.swap_remove(idx) {
                                LazyField::#variant_name(v) => v,
                                _ => None,
                            }
                        })
                }
            }
        }
        _ => {
            // For collection types, generate get (Option<&T>) and get_mut (&mut T)
            let ref_name =
                syn::Ident::new(&format!("{}", field_name), proc_macro2::Span::call_site());
            let mut_name = syn::Ident::new(
                &format!("{}_mut", field_name),
                proc_macro2::Span::call_site(),
            );

            quote! {
                /// Get a reference to the collection (may be None if not allocated)
                fn #ref_name(&self) -> Option<&#field_type> {
                    self.typed().find_lazy(|f| match f {
                        LazyField::#variant_name(v) => Some(v),
                        _ => None,
                    })
                }

                /// Get a mutable reference to the collection (allocates if needed)
                fn #mut_name(&mut self) -> &mut #field_type {
                    let typed = self.typed_mut(#category_variant);
                    typed.get_or_create_lazy(
                        |f| matches!(f, LazyField::#variant_name(_)),
                        |f| match f {
                            LazyField::#variant_name(v) => Some(v),
                            _ => None,
                        },
                        || LazyField::#variant_name(Default::default()),
                    )
                }
            }
        }
    }
}

/// Generates trait accessor methods for a flag field (stored in TaskFlags bitfield)
fn generate_flag_trait_accessor_methods(
    field: &StorageFieldAttributes,
) -> proc_macro2::TokenStream {
    let field_name = &field.field_name;
    let set_name = syn::Ident::new(
        &format!("set_{}", field_name),
        proc_macro2::Span::call_site(),
    );

    // All flags modify the meta category
    let category_variant = quote! { crate::backend::storage::SpecificTaskDataCategory::Meta };

    quote! {
        /// Get the flag value
        fn #field_name(&self) -> bool {
            self.typed().flags.#field_name()
        }

        /// Set the flag value
        fn #set_name(&mut self, value: bool) {
            self.typed_mut(#category_variant).flags.#set_name(value);
        }
    }
}

/// Generate encode/decode methods for TypedStorage serialization.
///
/// Generates four methods:
/// - `encode_meta<E>(&self, encoder: &mut E)` - Encode meta category fields
/// - `encode_data<E>(&self, encoder: &mut E)` - Encode data category fields
/// - `decode_meta<D>(&mut self, decoder: &mut D)` - Decode meta category fields
/// - `decode_data<D>(&mut self, decoder: &mut D)` - Decode data category fields
///
/// Only persistent (non-transient) fields are encoded/decoded.
fn generate_encode_decode_methods(grouped_fields: &GroupedFields) -> proc_macro2::TokenStream {
    // Collect persistent inline fields by category
    let persistent_inline_meta: Vec<_> = grouped_fields
        .inline_meta_fields
        .iter()
        .filter(|f| !f.transient)
        .collect();
    let persistent_inline_data: Vec<_> = grouped_fields
        .inline_data_fields
        .iter()
        .filter(|f| !f.transient)
        .collect();

    // Collect persistent lazy fields by category
    let persistent_lazy_meta: Vec<_> = grouped_fields
        .lazy_meta_fields
        .iter()
        .filter(|f| !f.transient)
        .collect();
    let persistent_lazy_data: Vec<_> = grouped_fields
        .lazy_data_fields
        .iter()
        .filter(|f| !f.transient)
        .collect();

    let has_flags = !grouped_fields.persisted_flag_fields.is_empty();

    // Generate encode_meta body
    let encode_meta_inline: Vec<_> = persistent_inline_meta
        .iter()
        .map(|field| {
            let field_name = &field.field_name;
            quote! {
                bincode::Encode::encode(&self.#field_name, encoder)?;
            }
        })
        .collect();

    let encode_meta_flags = if has_flags {
        quote! {
            // Encode only the persisted flag bits
            let persisted_flags = self.flags.persisted_bits();
            bincode::Encode::encode(&persisted_flags, encoder)?;
        }
    } else {
        quote! {}
    };

    let encode_meta_lazy = generate_encode_lazy_fields(&persistent_lazy_meta);

    // Generate encode_data body
    let encode_data_inline: Vec<_> = persistent_inline_data
        .iter()
        .map(|field| {
            let field_name = &field.field_name;
            quote! {
                bincode::Encode::encode(&self.#field_name, encoder)?;
            }
        })
        .collect();

    let encode_data_lazy = generate_encode_lazy_fields(&persistent_lazy_data);

    // Generate decode_meta body
    let decode_meta_inline: Vec<_> = persistent_inline_meta
        .iter()
        .map(|field| {
            let field_name = &field.field_name;
            quote! {
                self.#field_name = bincode::Decode::decode(decoder)?;
            }
        })
        .collect();

    let decode_meta_flags = if has_flags {
        quote! {
            // Decode only the persisted flag bits, preserving transient bits
            let persisted_flags: u16 = bincode::Decode::decode(decoder)?;
            self.flags.set_persisted_bits(persisted_flags);
        }
    } else {
        quote! {}
    };

    let decode_meta_lazy = generate_decode_lazy_fields(&persistent_lazy_meta);

    // Generate decode_data body
    let decode_data_inline: Vec<_> = persistent_inline_data
        .iter()
        .map(|field| {
            let field_name = &field.field_name;
            quote! {
                self.#field_name = bincode::Decode::decode(decoder)?;
            }
        })
        .collect();

    let decode_data_lazy = generate_decode_lazy_fields(&persistent_lazy_data);

    quote! {
        impl TypedStorage {
            /// Encode meta category fields directly to bincode.
            /// Only persistent (non-transient) fields are encoded.
            pub fn encode_meta<E: bincode::enc::Encoder>(
                &self,
                encoder: &mut E,
            ) -> Result<(), bincode::error::EncodeError> {
                // Encode inline meta fields
                #(#encode_meta_inline)*

                // Encode flags (persisted bits only)
                #encode_meta_flags

                // Encode lazy meta fields
                #encode_meta_lazy

                Ok(())
            }

            /// Encode data category fields directly to bincode.
            /// Only persistent (non-transient) fields are encoded.
            pub fn encode_data<E: bincode::enc::Encoder>(
                &self,
                encoder: &mut E,
            ) -> Result<(), bincode::error::EncodeError> {
                // Encode inline data fields
                #(#encode_data_inline)*

                // Encode lazy data fields
                #encode_data_lazy

                Ok(())
            }

            /// Decode meta category fields from bincode.
            /// Only persistent (non-transient) fields are decoded.
            pub fn decode_meta<D: bincode::de::Decoder>(
                &mut self,
                decoder: &mut D,
            ) -> Result<(), bincode::error::DecodeError> {
                // Decode inline meta fields
                #(#decode_meta_inline)*

                // Decode flags (persisted bits only)
                #decode_meta_flags

                // Decode lazy meta fields
                #decode_meta_lazy

                Ok(())
            }

            /// Decode data category fields from bincode.
            /// Only persistent (non-transient) fields are decoded.
            pub fn decode_data<D: bincode::de::Decoder>(
                &mut self,
                decoder: &mut D,
            ) -> Result<(), bincode::error::DecodeError> {
                // Decode inline data fields
                #(#decode_data_inline)*

                // Decode lazy data fields
                #decode_data_lazy

                Ok(())
            }
        }
    }
}

/// Sentinel byte marking the end of lazy fields in serialization.
/// Must be a value that cannot be a valid discriminant (discriminants start at 0).
const LAZY_FIELD_SENTINEL: u8 = 0x00;

/// Generate code to encode lazy fields to bincode.
/// Uses sentinel-terminated format: [discriminant, data]... [sentinel]
fn generate_encode_lazy_fields(fields: &[&StorageFieldAttributes]) -> proc_macro2::TokenStream {
    if fields.is_empty() {
        return quote! {};
    }

    // Generate match arms for encoding each field variant
    let encode_arms: Vec<_> = fields
        .iter()
        .enumerate()
        .map(|(idx, field)| {
            let variant_name = syn::Ident::new(
                &to_pascal_case(&field.field_name.to_string()),
                field.field_name.span(),
            );
            let discriminant = idx as u8 + 1;
            quote! {
                LazyField::#variant_name(data) => {
                    bincode::Encode::encode(&#discriminant, encoder)?;
                    bincode::Encode::encode(data, encoder)?;
                }
            }
        })
        .collect();

    quote! {
        // Encode each persistent lazy field in this category
        for field in &self.lazy {
            match field {
                #(#encode_arms)*
                _ => {} // Skip fields not in this category
            }
        }
        // Write sentinel to mark end of lazy fields
        bincode::Encode::encode(&#LAZY_FIELD_SENTINEL, encoder)?;
    }
}

/// Generate code to decode lazy fields from bincode.
/// Reads until sentinel byte (0xFF) is encountered.
fn generate_decode_lazy_fields(fields: &[&StorageFieldAttributes]) -> proc_macro2::TokenStream {
    if fields.is_empty() {
        return quote! {};
    }

    // Generate match arms for decoding each field variant
    let decode_arms: Vec<_> = fields
        .iter()
        .enumerate()
        .map(|(idx, field)| {
            let variant_name = syn::Ident::new(
                &to_pascal_case(&field.field_name.to_string()),
                field.field_name.span(),
            );
            let discriminant = idx as u8 + 1;
            quote! {
                #discriminant => LazyField::#variant_name(bincode::Decode::decode(decoder)?)
            }
        })
        .collect();

    quote! {
        // Decode lazy fields until LAZY_FIELD_SENTINEL
        loop {
            let discriminant: u8 = bincode::Decode::decode(decoder)?;
            let field = match discriminant {
                #(#decode_arms,)*
                #LAZY_FIELD_SENTINEL => {
                    break
                }
                _ => {
                    return Err(bincode::error::DecodeError::Other(
                        "Unknown lazy field discriminant",
                    ));
                }
            };
            self.lazy.push(field);
        }
    }
}

/// Generate snapshot clone and merge methods for TypedStorage.
///
/// Generates:
/// - `clone_meta_snapshot(&self) -> TypedStorage` - Clone only persistent meta fields
/// - `clone_data_snapshot(&self) -> TypedStorage` - Clone only persistent data fields
/// - `merge_from_restored(&mut self, source, category)` - Merge restored data by category
/// - `merge_meta_from(&mut self, source)` - Merge meta fields from source
/// - `merge_data_from(&mut self, source)` - Merge data fields from source
/// - `merge_all_from(&mut self, source)` - Merge all fields from source
fn generate_snapshot_merge_methods(grouped_fields: &GroupedFields) -> proc_macro2::TokenStream {
    let has_flags = !grouped_fields.persisted_flag_fields.is_empty();

    // Collect persistent inline fields by category
    let persistent_inline_meta: Vec<_> = grouped_fields
        .inline_meta_fields
        .iter()
        .filter(|f| !f.transient)
        .collect();
    let persistent_inline_data: Vec<_> = grouped_fields
        .inline_data_fields
        .iter()
        .filter(|f| !f.transient)
        .collect();

    // Collect persistent lazy fields by category
    let persistent_lazy_meta: Vec<_> = grouped_fields
        .lazy_meta_fields
        .iter()
        .filter(|f| !f.transient)
        .collect();
    let persistent_lazy_data: Vec<_> = grouped_fields
        .lazy_data_fields
        .iter()
        .filter(|f| !f.transient)
        .collect();

    // Generate clone_meta_snapshot inline field assignments
    let clone_meta_inline: Vec<_> = persistent_inline_meta
        .iter()
        .map(|field| {
            let field_name = &field.field_name;
            quote! {
                snapshot.#field_name = self.#field_name.clone();
            }
        })
        .collect();

    // Generate clone_meta_snapshot lazy field match arms
    let clone_meta_lazy_arms: Vec<_> = persistent_lazy_meta
        .iter()
        .map(|field| {
            let variant_name = syn::Ident::new(
                &to_pascal_case(&field.field_name.to_string()),
                field.field_name.span(),
            );
            quote! {
                LazyField::#variant_name(data) => {
                    snapshot.lazy.push(LazyField::#variant_name(data.clone()));
                }
            }
        })
        .collect();

    // Generate clone_data_snapshot inline field assignments
    let clone_data_inline: Vec<_> = persistent_inline_data
        .iter()
        .map(|field| {
            let field_name = &field.field_name;
            quote! {
                snapshot.#field_name = self.#field_name.clone();
            }
        })
        .collect();

    // Generate clone_data_snapshot lazy field match arms
    let clone_data_lazy_arms: Vec<_> = persistent_lazy_data
        .iter()
        .map(|field| {
            let variant_name = syn::Ident::new(
                &to_pascal_case(&field.field_name.to_string()),
                field.field_name.span(),
            );
            quote! {
                LazyField::#variant_name(data) => {
                    snapshot.lazy.push(LazyField::#variant_name(data.clone()));
                }
            }
        })
        .collect();

    // Generate merge_meta_from inline field assignments
    let merge_meta_inline: Vec<_> = persistent_inline_meta
        .iter()
        .map(|field| {
            let field_name = &field.field_name;
            quote! {
                self.#field_name = source.#field_name;
            }
        })
        .collect();

    // Generate merge_meta_from lazy field match arms
    let merge_meta_lazy_arms: Vec<_> = persistent_lazy_meta
        .iter()
        .map(|field| {
            let variant_name = syn::Ident::new(
                &to_pascal_case(&field.field_name.to_string()),
                field.field_name.span(),
            );
            quote! {
                LazyField::#variant_name(_) => {
                    self.lazy.push(field);
                }
            }
        })
        .collect();

    // Generate merge_data_from inline field assignments
    let merge_data_inline: Vec<_> = persistent_inline_data
        .iter()
        .map(|field| {
            let field_name = &field.field_name;
            quote! {
                self.#field_name = source.#field_name;
            }
        })
        .collect();

    // Generate merge_data_from lazy field match arms
    let merge_data_lazy_arms: Vec<_> = persistent_lazy_data
        .iter()
        .map(|field| {
            let variant_name = syn::Ident::new(
                &to_pascal_case(&field.field_name.to_string()),
                field.field_name.span(),
            );
            quote! {
                LazyField::#variant_name(_) => {
                    self.lazy.push(field);
                }
            }
        })
        .collect();

    // Generate merge_all_from inline field assignments (both meta and data)
    let merge_all_inline_meta: Vec<_> = persistent_inline_meta
        .iter()
        .map(|field| {
            let field_name = &field.field_name;
            quote! {
                self.#field_name = source.#field_name;
            }
        })
        .collect();
    let merge_all_inline_data: Vec<_> = persistent_inline_data
        .iter()
        .map(|field| {
            let field_name = &field.field_name;
            quote! {
                self.#field_name = source.#field_name;
            }
        })
        .collect();

    // Generate merge_all_from lazy field match arms (both meta and data, combined)
    let merge_all_lazy_arms: Vec<_> = persistent_lazy_meta
        .iter()
        .chain(persistent_lazy_data.iter())
        .map(|field| {
            let variant_name = syn::Ident::new(
                &to_pascal_case(&field.field_name.to_string()),
                field.field_name.span(),
            );
            quote! {
                LazyField::#variant_name(_) => {
                    self.lazy.push(field);
                }
            }
        })
        .collect();

    // Generate flags handling for clone/merge
    let clone_meta_flags = if has_flags {
        quote! {
            // Clone persisted flags
            snapshot.flags.set_persisted_bits(self.flags.persisted_bits());
        }
    } else {
        quote! {}
    };

    let merge_flags = if has_flags {
        quote! {
            // Merge persisted flags (preserve transient flags)
            let persisted_bits = source.flags.persisted_bits();
            self.flags.set_persisted_bits(persisted_bits);
        }
    } else {
        quote! {}
    };

    // Collect all persistent lazy fields (both meta and data) for clone_snapshot
    let clone_all_lazy_arms: Vec<_> = persistent_lazy_meta
        .iter()
        .chain(persistent_lazy_data.iter())
        .map(|field| {
            let variant_name = syn::Ident::new(
                &to_pascal_case(&field.field_name.to_string()),
                field.field_name.span(),
            );
            quote! {
                LazyField::#variant_name(data) => {
                    snapshot.lazy.push(LazyField::#variant_name(data.clone()));
                }
            }
        })
        .collect();

    quote! {
        impl TypedStorage {
            /// Create a snapshot containing all persistent fields (both meta and data).
            ///
            /// This clones all persistent fields into a new TypedStorage, skipping
            /// transient fields that may not be cloneable. Use this for the `Both`
            /// snapshot case where both meta and data are dirty.
            pub fn clone_snapshot(&self) -> TypedStorage {
                let mut snapshot = TypedStorage::new();

                // Clone inline meta fields
                #(#clone_meta_inline)*

                // Clone inline data fields
                #(#clone_data_inline)*

                #clone_meta_flags

                // Clone all persistent lazy fields (both meta and data)
                for field in &self.lazy {
                    match field {
                        #(#clone_all_lazy_arms)*
                        // Skip transient fields
                        _ => {}
                    }
                }

                snapshot
            }

            /// Create a snapshot containing only meta category fields for serialization.
            ///
            /// This clones only the persistent meta fields into a new TypedStorage,
            /// which can then be serialized outside the lock.
            pub fn clone_meta_snapshot(&self) -> TypedStorage {
                let mut snapshot = TypedStorage::new();

                // Clone inline meta fields
                #(#clone_meta_inline)*

                #clone_meta_flags

                // Clone lazy meta fields (only persistent ones)
                for field in &self.lazy {
                    match field {
                        #(#clone_meta_lazy_arms)*
                        // Skip transient and data fields
                        _ => {}
                    }
                }

                snapshot
            }

            /// Create a snapshot containing only data category fields for serialization.
            ///
            /// This clones only the persistent data fields into a new TypedStorage,
            /// which can then be serialized outside the lock.
            pub fn clone_data_snapshot(&self) -> TypedStorage {
                let mut snapshot = TypedStorage::new();

                // Clone inline data fields
                #(#clone_data_inline)*

                // Clone lazy data fields (only persistent ones)
                for field in &self.lazy {
                    match field {
                        #(#clone_data_lazy_arms)*
                        // Skip transient and meta fields
                        _ => {}
                    }
                }

                snapshot
            }

            /// Merge restored data from another TypedStorage.
            ///
            /// This is used during restore operations to merge decoded persisted data
            /// into the task's existing storage. It preserves transient state (flags,
            /// transient fields) while merging in the persisted data.
            ///
            /// Note: This assumes the target is unrestored and has empty persistent fields
            /// for the specified category. The merge simply moves data from source to self.
            ///
            /// The `category` parameter specifies which category of data to merge:
            /// - `Meta`: Merge meta fields (aggregation_number, output, upper, dirty, etc.)
            /// - `Data`: Merge data fields (output_dependent, dependencies, cell_data, etc.)
            /// - `All`: Merge both meta and data fields
            pub fn merge_from_restored(
                &mut self,
                source: TypedStorage,
                category: crate::backend::TaskDataCategory,
            ) {
                match category {
                    crate::backend::TaskDataCategory::Meta => self.merge_meta_from(source),
                    crate::backend::TaskDataCategory::Data => self.merge_data_from(source),
                    crate::backend::TaskDataCategory::All => self.merge_all_from(source),
                }
            }

            /// Merge meta category fields from source.
            fn merge_meta_from(&mut self, source: TypedStorage) {
                // Inline meta fields - direct move (target should be empty for unrestored category)
                #(#merge_meta_inline)*

                #merge_flags

                // Move lazy meta fields from source
                for field in source.lazy {
                    match &field {
                        #(#merge_meta_lazy_arms)*
                        // Skip transient fields and data fields
                        _ => {}
                    }
                }
            }

            /// Merge data category fields from source.
            fn merge_data_from(&mut self, source: TypedStorage) {
                // Inline data fields - direct move (target should be empty for unrestored category)
                #(#merge_data_inline)*

                // Move lazy data fields from source
                for field in source.lazy {
                    match &field {
                        #(#merge_data_lazy_arms)*
                        // Skip transient fields and meta fields
                        _ => {}
                    }
                }
            }

            /// Merge all fields from source (both meta and data).
            fn merge_all_from(&mut self, source: TypedStorage) {
                // Inline meta fields - direct move
                #(#merge_all_inline_meta)*

                // Inline data fields - direct move
                #(#merge_all_inline_data)*

                #merge_flags

                // Move all lazy fields (both meta and data, but skip transient)
                for field in source.lazy {
                    match &field {
                        #(#merge_all_lazy_arms)*
                        // Skip transient fields
                        _ => {}
                    }
                }
            }
        }
    }
}
