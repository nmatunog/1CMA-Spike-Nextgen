// Apply every numbered SQL file in migrations/ in lexical order (0001, 0002 if
// present, 0003, ...). Shared by GIA tests and the local demo so a later C1
// 0002 is picked up without a hard-coded list. Does not import recruitment/.
import { readdir, readFile } from 'node:fs/promises';

export async function listMigrationFiles(dir = 'migrations') {
  return (await readdir(dir)).filter(name => /^\d+.*\.sql$/.test(name)).sort();
}

export async function applyAllMigrations(exec, dir = 'migrations') {
  for (const name of await listMigrationFiles(dir)) {
    await exec(await readFile(`${dir}/${name}`, 'utf8'));
  }
}
