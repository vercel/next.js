import fs from "fs";
import chokidar from "chokidar";

/**
 * Run watch mode, watching on @var rootPath
 */
export function watchItems(rootPath: string, cb: () => void): void {
  chokidar
    .watch(rootPath, { ignoreInitial: true, awaitWriteFinish: true })
    .on("add", cb)
    .on("unlink", cb);
}

/**
 * Using @var path find all files recursively and generate output using @var resolveItem by calling it for each file
 * @param path plugins path
 * @param resolveItem will resolve item in required data format
 * @param cb will be called when new item is found
 * @param fileFormat Matches specific files
 * @returns {Item[]} items
 */
export function getItems<Item>(settings: {
  path: string;
  resolveItem: (path: string, name: string) => Item;
  cb?: (name: string) => void;
  fileFormat?: RegExp;
}): Item[] {
  const {
    path,
    resolveItem,
    cb,
    fileFormat = new RegExp(/(.+)(?<!\.d)\.[jt]sx?$/),
  } = settings;
  const items: Item[] = [];
  const folders: fs.Dirent[] = [];

  if (!fs.existsSync(path)) return [];

  fs.readdirSync(path, { withFileTypes: true }).forEach((item) => {
    if (item.isDirectory()) {
      folders.push(item);
    }

    if (fileFormat.test(item.name)) {
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      const name = item.name.match(fileFormat)![1];
      items.push(resolveItem(path, name));
      cb && cb(name);
    }
  });

  for (const folder of folders) {
    items.push(
      ...getItems<Item>({
        path: `${path}/${folder.name}`,
        resolveItem,
        cb,
        fileFormat,
      }),
    );
  }

  return items;
}
