import pg from 'pg';
//pg.types.setTypeParser(1184, str => str);
import { pguser, pgport, pgpassword, pgdb, pghost } from './config.js';

const Client = pg.Client;
const client = new Client({
  user: pguser,
  password: pgpassword,
  host: pghost,
  database: pgdb,
  port: pgport
})

// Connect to the database once when the application starts
await client.connect();

export async function getOwnerIDByName(ownerName) {
  const queryText = `
    SELECT id FROM missingwax.producer WHERE owner_name = $1 LIMIT 1;
  `;

  const queryValues = [ownerName];

  try {
    const { rows } = await client.query(queryText, queryValues);
    if (rows.length === 0) {
      throw new Error(`No producer found for owner name: ${ownerName}`);
    }
    return rows[0].id;
  } catch (err) {
    console.error('Error fetching owner ID:', err);
    throw err; // Or return null if you'd rather not throw an error.
  }
}



export async function getMissingBlockData(ownerName, startDate, endDate) {
  let query;
  let values;

  if (ownerName) {
    query = `
      SELECT p.owner_name, mb.block_number, TO_CHAR(mb.date, 'YYYY-MM-DD HH24:MI:SS.US') as date, mb.round_missed, mb.blocks_missed, mb.missed_block_count
      FROM missingwax.missingblocks mb
      INNER JOIN missingwax.producer p ON mb.producer_id = p.id
      WHERE p.owner_name = $1 AND mb.date BETWEEN $2 AND $3
      ORDER BY mb.date ASC
    `;
    values = [ownerName, startDate, endDate];
  } else {
    query = `
      SELECT p.owner_name, mb.block_number, TO_CHAR(mb.date, 'YYYY-MM-DD HH24:MI:SS.US') as date, mb.round_missed, mb.blocks_missed, mb.missed_block_count
      FROM missingwax.missingblocks mb
      INNER JOIN missingwax.producer p ON mb.producer_id = p.id
      WHERE mb.date BETWEEN $1 AND $2
      ORDER BY mb.date ASC
    `;
    values = [startDate, endDate];
  }

  const res = await client.query(query, values);
  return res.rows;
}

export async function getMissingBlockDataByDays(ownerName, days) {
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);
  const endDate = new Date();

  return await getMissingBlockData(ownerName, startDate, endDate);
}

//EmptyBlockData

export async function getEmptyBlockData(ownerName, startDate, endDate) {
  let query;
  let values;

  if (ownerName) {
    query = `
      SELECT p.owner_name, COUNT(eb.block_number) FILTER (WHERE eb.empty_block = TRUE) AS total_empty_blocks, ARRAY_AGG(eb.block_number) FILTER (WHERE eb.empty_block = TRUE) AS block_numbers, ARRAY_AGG(TO_CHAR(eb.date, 'YYYY-MM-DD HH24:MI:SS.US')) FILTER (WHERE eb.empty_block = TRUE) AS dates
      FROM missingwax.emptyblocks eb
      INNER JOIN missingwax.producer p ON eb.producer_id = p.id
      WHERE p.owner_name = $1 AND eb.date BETWEEN $2 AND $3
      GROUP BY p.owner_name
    `;
    values = [ownerName, startDate, endDate];
  } else {
    query = `
      SELECT p.owner_name, COUNT(eb.block_number) FILTER (WHERE eb.empty_block = TRUE) AS total_empty_blocks, ARRAY_AGG(eb.block_number) FILTER (WHERE eb.empty_block = TRUE) AS block_numbers, ARRAY_AGG(TO_CHAR(eb.date, 'YYYY-MM-DD HH24:MI:SS.US')) FILTER (WHERE eb.empty_block = TRUE) AS dates
      FROM missingwax.emptyblocks eb
      INNER JOIN missingwax.producer p ON eb.producer_id = p.id
      WHERE eb.date BETWEEN $1 AND $2
      GROUP BY p.owner_name
    `;
    values = [startDate, endDate];
  }

  const res = await client.query(query, values);
  return res.rows;
}

export async function getEmptyBlockDataByDays(ownerName, days) {
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);
  const endDate = new Date();

  return await getEmptyBlockData(ownerName, startDate, endDate);
}


export async function getScheduleChangesForDays(ownerName, days) {
  const fromDate = new Date();
  fromDate.setDate(fromDate.getDate() - days);

  const queryText = `
    WITH producer_info AS (
      SELECT id FROM missingwax.producer WHERE owner_name = $2 LIMIT 1
    )
    SELECT s.* FROM missingwax.schedules s, producer_info
    WHERE s.date >= $1
    AND (s.schedule_producers @> ARRAY[producer_info.id] OR NOT s.schedule_producers && ARRAY[producer_info.id])
    ORDER BY s.date;
  `;

  const queryValues = [fromDate, ownerName];

  try {
    const { rows } = await client.query(queryText, queryValues);
    return rows;
  } catch (err) {
    console.error('Error fetching schedule changes:', err);
    return [];
  }
}

export async function getLatestMonitoringData2() {
  const queryText = `
    SELECT block_number, TO_CHAR(date, 'YYYY-MM-DD HH24:MI:SS.US') as date FROM missingwax.monitoring ORDER BY id DESC LIMIT 1;
  `;

  try {
    const { rows } = await client.query(queryText);
    if (rows.length === 0) {
      throw new Error('No data found in monitoring table');
    }
    return rows[0];
  } catch (err) {
    console.error('Error fetching latest monitoring data:', err);
    throw err; // Or return null if you'd rather not throw an error.
  }
}

process.on('exit', async () => {
  await client.end();
});



export async function getLatestMonitoringData() {
  const queryText = `
    SELECT p.owner_name, m.block_number, TO_CHAR(m.date, 'YYYY-MM-DD HH24:MI:SS.US') as date, m.first_in_schedule 
    FROM missingwax.monitoring m
    INNER JOIN missingwax.producer p ON m.producer_id = p.id
    ORDER BY m.id DESC 
    LIMIT 1;
  `;

  try {
    const { rows } = await client.query(queryText);
    if (rows.length === 0) {
      throw new Error('No data found in monitoring table');
    }
    return rows[0];
  } catch (err) {
    console.error('Error fetching latest monitoring data:', err);
    throw err; // Or return null if you'd rather not throw an error.
  }
}