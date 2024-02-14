async function* resolvePathConflictsInList(list) {
  const pathToEntryMap = new Map();

  for (item of list) {
    let path = item;
    let pathConflict;
    while ((pathConflict = pathToEntryMap.has(path))) {
      const providedAlias = await Promise.resolve(yield path);
      console.log(`Trying ${providedAlias}`);
      path = providedAlias;
    }

    console.log(`Setting ${path} to ${item}`);
    pathToEntryMap.set(path, item);
  }

  console.log(`Returning`);
  return pathToEntryMap;
}

let str = '';

async function generate() {
  const fooList = ['foo', 'foo', 'bar'];
  const g = resolvePathConflictsInList(fooList);

  let conflict = await g.next();
  console.log(conflict);
  while (!conflict.done) {
    conflict = await g.next(
      new Promise((resolve) => {
        setTimeout(() => {
          resolve(Math.random());
        }, 1000);
      }),
    );
  }

  console.log('Done', conflict);

  // for await (const conflict of foo()) {
  //   str = str + val;
  // }
  // console.log(str);
}

generate();
