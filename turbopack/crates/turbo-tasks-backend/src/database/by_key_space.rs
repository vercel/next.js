use crate::database::key_value_database::KeySpace;

pub struct ByKeySpace<T> {
    infra: T,
    task_meta: T,
    task_data: T,
    task_cache: T,
}

impl<T> ByKeySpace<T> {
    pub fn new(mut factory: impl FnMut(KeySpace) -> T) -> Self {
        Self {
            infra: factory(KeySpace::Infra),
            task_meta: factory(KeySpace::TaskMeta),
            task_data: factory(KeySpace::TaskData),
            task_cache: factory(KeySpace::TaskCache),
        }
    }

    pub fn get(&self, key_space: KeySpace) -> &T {
        match key_space {
            KeySpace::Infra => &self.infra,
            KeySpace::TaskMeta => &self.task_meta,
            KeySpace::TaskData => &self.task_data,
            KeySpace::TaskCache => &self.task_cache,
        }
    }

    pub fn get_mut(&mut self, key_space: KeySpace) -> &mut T {
        match key_space {
            KeySpace::Infra => &mut self.infra,
            KeySpace::TaskMeta => &mut self.task_meta,
            KeySpace::TaskData => &mut self.task_data,
            KeySpace::TaskCache => &mut self.task_cache,
        }
    }

    pub fn iter(&self) -> impl Iterator<Item = (KeySpace, &T)> {
        [
            (KeySpace::Infra, &self.infra),
            (KeySpace::TaskMeta, &self.task_meta),
            (KeySpace::TaskData, &self.task_data),
            (KeySpace::TaskCache, &self.task_cache),
        ]
        .into_iter()
    }
}
