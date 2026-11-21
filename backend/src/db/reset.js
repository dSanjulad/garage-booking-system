// Drops and rebuilds the database named in DB_NAME from schema.sql.
// This deletes everything in that database, so it asks for --yes.
// Needs no mysql command-line client, so it also works on Windows.
//   npm run db:reset           schema only
//   npm run db:reset -- --seed is handled by the db:fresh script
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');

// mysql2 does not understand the client-only DELIMITER command, so split
// the file the same way the mysql client would.
function splitStatements(sql) {
  const statements = [];
  let delimiter = ';';
  let buffer = '';
  for (const line of sql.split(/\r?\n/)) {
    const match = line.match(/^\s*DELIMITER\s+(\S+)\s*$/i);
    if (match) {
      delimiter = match[1];
      continue;
    }
    if (/^\s*--/.test(line) && !buffer.trim()) continue;
    buffer += `${line}\n`;
    if (line.trimEnd().endsWith(delimiter)) {
      const text = buffer.trimEnd();
      statements.push(text.slice(0, text.length - delimiter.length));
      buffer = '';
    }
  }
  return statements.filter((s) => s.trim());
}

async function main() {
  const dbName = process.env.DB_NAME || 'garage_booking_db';
  if (!process.argv.includes('--yes')) {
    console.error(`This deletes all data in "${dbName}". Re-run with --yes to continue.`);
    process.exit(1);
  }
  const conn = await mysql.createConnection({
    host: process.env.DB_HOST || 'localhost',
    port: process.env.DB_PORT || 3306,
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || ''
  });
  await conn.query(`DROP DATABASE IF EXISTS \`${dbName}\``);

  const raw = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8')
    .replaceAll('garage_booking_db', dbName);
  for (const statement of splitStatements(raw)) {
    await conn.query(statement);
  }
  console.log(`Database "${dbName}" rebuilt from schema.sql.`);
  await conn.end();
}

if (require.main === module) {
  main().catch((err) => {
    console.error(err.message);
    process.exit(1);
  });
}

module.exports = { splitStatements };
