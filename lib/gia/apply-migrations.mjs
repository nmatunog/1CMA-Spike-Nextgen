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

/** Append-only tables whose TRUNCATE triggers must be paused for synthetic test reset. */
export const APPEND_ONLY_TABLES = ['candidate_events', 'command_audit_events', 'gia_turns'];

export async function resetWorkflowTables(exec, tablesSql) {
  for (const name of APPEND_ONLY_TABLES) {
    await exec(`ALTER TABLE ${name} DISABLE TRIGGER USER`);
  }
  try {
    await exec(`TRUNCATE ${tablesSql} CASCADE`);
  } finally {
    for (const name of APPEND_ONLY_TABLES) {
      await exec(`ALTER TABLE ${name} ENABLE TRIGGER USER`);
    }
  }
}
