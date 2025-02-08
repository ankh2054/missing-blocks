/*Execute scriot like this \i postgresql.sql */

CREATE USER waxuser WITH PASSWORD 'Nightshade900!';

CREATE DATABASE missingwax;

\c missingwax;

DROP SCHEMA IF EXISTS missingwax CASCADE;

CREATE SCHEMA missingwax;

/* List of producers on chain */
CREATE TABLE missingwax.producer (
  id SERIAL PRIMARY KEY,
  owner_name VARCHAR(12) UNIQUE
);


/* Keep a list of producers that are pending for removal - once schedule changes table is cleared*/
CREATE TABLE missingwax.unregbot (
  id SERIAL PRIMARY KEY,
  producer_id INTEGER NOT NULL UNIQUE,
  FOREIGN KEY (producer_id) REFERENCES missingwax.producer(id)
);


/* List of missing blocks and or rounds */
CREATE TABLE missingwax.missingblocks(
  id SERIAL PRIMARY KEY,
  producer_id INTEGER NOT NULL,
  block_number INTEGER,
  date TIMESTAMP,
  round_missed BOOLEAN,  /* If a round was missed set to TRUE */
  blocks_missed  BOOLEAN, /* If block was missed at blocks, set to TRUE */
  missed_block_count INTEGER,  /* Number of blocks missed */
  FOREIGN KEY (producer_id) REFERENCES missingwax.producer(id)
);

/* List of blocks with zero transactions */
CREATE TABLE missingwax.emptyblocks(
  id SERIAL PRIMARY KEY,
  producer_id INTEGER NOT NULL,
  block_number INTEGER,
  date TIMESTAMP,
  empty_block BOOLEAN,  /* If no transactions on block set to true */
  FOREIGN KEY (producer_id) REFERENCES missingwax.producer(id)
);

CREATE TABLE missingwax.schedules(
  id SERIAL PRIMARY KEY,  /* An unique identifier for each row in the schedules table */
  schedule_number INTEGER NOT NULL,
  block_number INTEGER,
  date TIMESTAMP,
  producer_id INTEGER NOT NULL,
  schedule_position INTEGER NOT NULL,
  schedule_producers INTEGER[], /* Array of producer IDs from the producer table */
  FOREIGN KEY (producer_id) REFERENCES missingwax.producer(id)
);

CREATE TABLE missingwax.monitoring(
  id SERIAL PRIMARY KEY,  
  block_number INTEGER,
  date TIMESTAMP,
  producer_id INTEGER NOT NULL,
  first_in_schedule BOOLEAN;
  FOREIGN KEY (producer_id) REFERENCES missingwax.producer(id)
);

GRANT ALL PRIVILEGES ON DATABASE missingwax TO waxuser;
GRANT ALL PRIVILEGES ON SCHEMA missingwax TO waxuser;
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA missingwax TO waxuser;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA missingwax TO waxuser;
ALTER DEFAULT PRIVILEGES IN SCHEMA missingwax GRANT ALL ON TABLES TO waxuser;
ALTER DEFAULT PRIVILEGES IN SCHEMA missingwax GRANT ALL ON SEQUENCES TO waxuser;