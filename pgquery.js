// Load env variables from the config.js
import { pguser, pgport, pgpassword, pgdb, pghost } from './config.js';
import pg from 'pg';

const Client = pg.Client;



function createDbClient() {
    return new Client({
      user: pguser,
      password: pgpassword,
      host: pghost,
      database: pgdb,
      port: pgport
    });
  }

  export async function addProducerToUnregbot(ownerName) {
    const client = createDbClient();
    try {
        await client.connect();
        // First, get the producer ID from the producer table using the owner name
        const producerQuery = 'SELECT id FROM missingwax.producer WHERE owner_name = $1';
        const producerResult = await client.query(producerQuery, [ownerName]);
        if (producerResult.rows.length === 0) {
            throw new Error(`No producer found with the name ${ownerName}`);
        }
        const producerId = producerResult.rows[0].id;

        // Then, insert the producer ID into the unregbot table only if it does not already exist
        const query = 'INSERT INTO missingwax.unregbot (producer_id) VALUES ($1) ON CONFLICT (producer_id) DO NOTHING';
        await client.query(query, [producerId]);
    } catch (error) {
        console.error(`Error: ${error}`);
    } finally {
        await client.end();
    }
}

export async function clearUnregbotTable() {
    const client = createDbClient();
    try {
        await client.connect();
        await client.query('DELETE FROM missingwax.unregbot');
        console.log("Unregbot table cleared");
    } catch (error) {
        console.error(`Error clearing unregbot table: ${error}`);
    } finally {
        await client.end();
    }
}

export async function addProducers(producerNames) {
    const client = createDbClient();

    // Filter out invalid or empty producer names
    const validProducers = producerNames.filter(name => name && typeof name === 'string');

    try {
        await client.connect();

        // create a query with a placeholder for each valid producer name
        const placeholders = validProducers.map((_, i) => `($${i + 1})`).join(",");
        const query = `INSERT INTO missingwax.producer (owner_name) VALUES ${placeholders} ON CONFLICT (owner_name) DO NOTHING`;

        await client.query(query, validProducers);

        console.log("Producers added or already exist");
    } catch (error) {
        console.error(`Error: ${error}`);
    } finally {
        await client.end();
    }
}


export async function addEmptyBlock(ownerName, blockNumber, date, emptyBlock) {
    const client = createDbClient();
    try {
        await client.connect();
        const producerQuery = 'SELECT id FROM missingwax.producer WHERE owner_name = $1';
        const producerValues = [ownerName];
        const producerResult = await client.query(producerQuery, producerValues);
        const producerId = producerResult.rows[0].id;
    
        const blockQuery = `
            INSERT INTO missingwax.emptyblocks (producer_id, block_number, date, empty_block)
            VALUES ($1, $2, $3, $4)
        `;
        const blockValues = [producerId, blockNumber, date, emptyBlock];
        await client.query(blockQuery, blockValues);
        console.log("Empty block data added");
    } catch (error) {
        console.error(`Error: ${error}`);
    } finally {
        await client.end();
    }
}
  

export async function addMissingBlock(ownerName, blockNumber, date, roundMissed, blocksMissed, missedBlockCount) {
    const client = createDbClient();
    try {
        await client.connect();
        const producerQuery = 'SELECT id FROM missingwax.producer WHERE owner_name = $1';
        const producerValues = [ownerName];
        const producerResult = await client.query(producerQuery, producerValues);
        const producerId = producerResult.rows[0].id;
    
        const blockQuery = `
            INSERT INTO missingwax.missingblocks (producer_id, block_number, date, round_missed, blocks_missed, missed_block_count)
            VALUES ($1, $2, $3, $4, $5, $6)
            ON CONFLICT (producer_id, block_number, date)
            DO NOTHING
        `;
        const blockValues = [producerId, blockNumber, date, roundMissed, blocksMissed, missedBlockCount];
        await client.query(blockQuery, blockValues);
        console.log("Missing block data added");
    } catch (error) {
        console.error(`Error: ${error}`);
    } finally {
        await client.end();
    }
}

export async function addSchedule(scheduleNumber, blockNumber, date, ownerName, schedulePosition, scheduleProducers) {
    const client = createDbClient();
    try {
        await client.connect();
        
        // Get the producer ID for the given owner name
        const producerQuery = 'SELECT id FROM missingwax.producer WHERE owner_name = $1';
        
        // Fetch the producerId for the primary producer (ownerName)
        const producerResult = await client.query(producerQuery, [ownerName]);
        const producerId = producerResult.rows[0].id;

        // Convert the list of owner names in scheduleProducers to a list of producer IDs
        const producerIds = [];
        for (let name of scheduleProducers) {
            const result = await client.query(producerQuery, [name]);
            producerIds.push(result.rows[0].id);
        }

        // Prepare the schedule insertion query
        const scheduleQuery = `
            INSERT INTO missingwax.schedules (schedule_number, block_number, date, producer_id, schedule_position, schedule_producers)
            VALUES ($1, $2, $3, $4, $5, $6)
        `;
        const scheduleValues = [scheduleNumber, blockNumber, date, producerId, schedulePosition, producerIds];
        await client.query(scheduleQuery, scheduleValues);

        console.log("Schedule data added");
    } catch (error) {
        console.error(`Error: ${error}`);
    } finally {
        await client.end();
    }
}



export async function getLatestSchedule() {
    const client = createDbClient();
    try {
        await client.connect();
        const query = `
            SELECT schedule_number 
            FROM missingwax.schedules 
            ORDER BY id DESC 
            LIMIT 1
        `;
        const result = await client.query(query);
        return result.rows[0].schedule_number;
    } catch (error) {
        console.error(`Error: ${error}`);
    } finally {
        await client.end();
    }
}


export async function saveToMonitoring(blockNumber, date, producerName) {
    const client = createDbClient();
    try {
        await client.connect();

        // Get the producer ID for the given producer name
        const producerQuery = 'SELECT id FROM missingwax.producer WHERE owner_name = $1';
        const producerResult = await client.query(producerQuery, [producerName]);
        const producerId = producerResult.rows[0].id;

        // Get the latest row from the schedules table
        const scheduleQuery = 'SELECT schedule_producers FROM missingwax.schedules ORDER BY date DESC LIMIT 1';
        const scheduleResult = await client.query(scheduleQuery);
        //const lastInSchedule = scheduleResult.rows[0].schedule_producers.slice(-1)[0] === producerId;
        const firstInSchedule = scheduleResult.rows[0].schedule_producers[0] === producerId;

        // Delete all entries from the monitoring table
        await client.query('DELETE FROM missingwax.monitoring');

        // Insert the new entry
        const insertQuery = `
            INSERT INTO missingwax.monitoring (block_number, date, producer_id, first_in_schedule)
            VALUES ($1, $2, $3, $4)
        `;
        const insertValues = [blockNumber, date, producerId, firstInSchedule];
        await client.query(insertQuery, insertValues);

        console.log("New entry added to monitoring table");
    } catch (error) {
        console.error(`Error: ${error}`);
    } finally {
        await client.end();
    }
}

export async function getLatestMonitoringData() {
    const client = createDbClient();
    const queryText = `
      SELECT block_number, date FROM missingwax.monitoring ORDER BY id DESC LIMIT 1;
    `;
  
    try {
        await client.connect();
        const { rows } = await client.query(queryText);
        if (rows.length === 0) {
            throw new Error('No data found in monitoring table');
        }
        return rows[0];
    } catch (err) {
        console.error('Error fetching latest monitoring data:', err);
        throw err; // Or return null if you'd rather not throw an error.
    } finally {
        await client.end();
    }
}