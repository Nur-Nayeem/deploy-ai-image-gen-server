import { Low } from 'lowdb';
import { JSONFile } from 'lowdb/node';

const adapter = new JSONFile('db.json');
const defaultData = { images: [] };

const db = new Low(adapter, defaultData);

await db.read();

// Sometimes data is null even with defaultData passed, so set explicitly:
if (!db.data) {
  db.data = defaultData;
  await db.write();
}

export default db;
