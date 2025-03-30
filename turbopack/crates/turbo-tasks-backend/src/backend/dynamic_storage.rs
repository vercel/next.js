use either::Either;
use turbo_tasks::KeyValuePair;

use crate::data::{
    CachedDataItem, CachedDataItemKey, CachedDataItemStorage, CachedDataItemType,
    CachedDataItemValue, CachedDataItemValueRef, CachedDataItemValueRefMut,
};

pub struct DynamicStorage {
    map: Vec<CachedDataItemStorage>,
}

impl DynamicStorage {
    pub fn new() -> Self {
        Self {
            map: Default::default(),
        }
    }

    fn get_or_create_map_mut(&mut self, ty: CachedDataItemType) -> &mut CachedDataItemStorage {
        let i = self.map.iter().position(|m| m.ty() == ty);
        if let Some(i) = i {
            &mut self.map[i]
        } else {
            self.map.reserve_exact(1);
            self.map.push(CachedDataItemStorage::new(ty));
            self.map.last_mut().unwrap()
        }
    }

    fn get_map_mut(&mut self, ty: CachedDataItemType) -> Option<&mut CachedDataItemStorage> {
        self.map.iter_mut().find(|m| m.ty() == ty)
    }

    fn get_map_index(&mut self, ty: CachedDataItemType) -> Option<usize> {
        self.map.iter_mut().position(|m| m.ty() == ty)
    }

    fn get_or_create_map_index(&mut self, ty: CachedDataItemType) -> usize {
        let i = self.map.iter().position(|m| m.ty() == ty);
        if let Some(i) = i {
            i
        } else {
            let i = self.map.len();
            self.map.reserve_exact(1);
            self.map.push(CachedDataItemStorage::new(ty));
            i
        }
    }

    fn get_map(&self, ty: CachedDataItemType) -> Option<&CachedDataItemStorage> {
        self.map.iter().find(|m| m.ty() == ty)
    }

    pub fn add(&mut self, item: CachedDataItem) -> bool {
        let ty = item.ty();
        self.get_or_create_map_mut(ty).add(item)
    }

    pub fn insert(&mut self, item: CachedDataItem) -> Option<CachedDataItemValue> {
        let ty = item.ty();
        self.get_or_create_map_mut(ty).insert(item)
    }

    pub fn remove(&mut self, key: &CachedDataItemKey) -> Option<CachedDataItemValue> {
        self.get_map_index(key.ty()).and_then(|i| {
            let storage = &mut self.map[i];
            let result = storage.remove(key);
            if result.is_some() && storage.is_empty() {
                self.map.swap_remove(i);
                self.map.shrink_to_fit();
            }
            result
        })
    }

    pub fn get(&self, key: &CachedDataItemKey) -> Option<CachedDataItemValueRef> {
        self.get_map(key.ty()).and_then(|m| m.get(key))
    }

    pub fn get_mut(&mut self, key: &CachedDataItemKey) -> Option<CachedDataItemValueRefMut> {
        self.get_map_mut(key.ty()).and_then(|m| m.get_mut(key))
    }

    pub fn get_mut_or_insert_with(
        &mut self,
        key: CachedDataItemKey,
        f: impl FnOnce() -> CachedDataItemValue,
    ) -> CachedDataItemValueRefMut<'_> {
        self.get_or_create_map_mut(key.ty())
            .get_mut_or_insert_with(key, f)
    }

    pub fn contains_key(&self, key: &CachedDataItemKey) -> bool {
        self.get_map(key.ty())
            .map(|m| m.contains_key(key))
            .unwrap_or_default()
    }

    pub fn count(&self, ty: CachedDataItemType) -> usize {
        self.get_map(ty).map(|m| m.len()).unwrap_or_default()
    }

    pub fn iter(
        &self,
        ty: CachedDataItemType,
    ) -> impl Iterator<Item = (CachedDataItemKey, CachedDataItemValueRef<'_>)> {
        self.get_map(ty).map(|m| m.iter()).into_iter().flatten()
    }

    pub fn iter_all(
        &self,
    ) -> impl Iterator<Item = (CachedDataItemKey, CachedDataItemValueRef<'_>)> {
        self.map.iter().flat_map(|m| m.iter())
    }

    pub fn extract_if<'l, F>(
        &'l mut self,
        ty: CachedDataItemType,
        mut f: F,
    ) -> impl Iterator<Item = CachedDataItem> + use<'l, F>
    where
        F: for<'a> FnMut(CachedDataItemKey, CachedDataItemValueRef<'a>) -> bool + 'l,
    {
        // TODO this could be more efficient when the storage would support extract_if directly.
        // This requires some macro magic to make it work...
        // But we could potentially avoid the two temporary Vecs.
        let Some(i) = self.get_map_index(ty) else {
            return Either::Left(std::iter::empty());
        };
        let storage = &mut self.map[i];
        let items_to_extract = storage
            .iter()
            .filter(|(k, v)| f(*k, *v))
            .map(|(key, _)| key)
            .collect::<Vec<_>>();
        let items = items_to_extract
            .into_iter()
            .map(move |key| {
                let value = storage.remove(&key).unwrap();
                CachedDataItem::from_key_and_value(key, value)
            })
            .collect::<Vec<_>>();
        if self.map[i].is_empty() {
            self.map.swap_remove(i);
            self.map.shrink_to_fit();
        }
        Either::Right(items.into_iter())
    }

    pub fn update(
        &mut self,
        key: CachedDataItemKey,
        update: impl FnOnce(Option<CachedDataItemValue>) -> Option<CachedDataItemValue>,
    ) {
        let i = self.get_or_create_map_index(key.ty());
        let map = &mut self.map[i];
        map.update(key, update);
        if map.is_empty() {
            self.map.swap_remove(i);
            self.map.shrink_to_fit();
        }
    }

    pub fn shrink_to_fit(&mut self, ty: CachedDataItemType) {
        if let Some(map) = self.get_map_mut(ty) {
            map.shrink_to_fit();
        }
    }
}
