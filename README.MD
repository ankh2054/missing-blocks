## Stack

### 0. Set .ENV variables acordingly

You can run this application either directly or with Docker:

#### Direct Setup:
- `cp defaults.env  .env` 
- `cp defaults.env fastify/.env`

#### Docker Setup:
1. Copy the defaults:
```bash
cp defaults.env .env
```

2. Start the application:
```bash
docker-compose up --build
```

3. To stop:
```bash
docker-compose down
```

The Docker setup includes:
- PostgreSQL database (auto-initialized with schema)
- Node.js application running both streamingBlocks and fastify server
- Automatic environment variable configuration from .env file
- Data persistence via Docker volumes

To run with custom environment variables:
```bash
docker-compose up -d --build \
  -e PGUSER=customuser \
  -e DB_PASSWORD=custompassword \
  -e PGDB=customdb \
  -e SHIPHOST=http://custom:8888 \
  -e HYPERIONHOST=http://custom:7000 \
  -e STREAMINGHOST=ws://custom:9876
```

### 1. fastify/ API and Swagger documentation 
`npm start`

### 2. streamingBlocks.js - Capture missing blocks and saves to DB.
`node streamingBlocks.js`

- By default when the process starts it will check the monitoring table for the last round saved and automatically start from the next round.The monitoring table will always contain the last block of a round.

If starting this process for a brand new chain OR starting from a blank slate use the --firststart option
`node streamingBlocks.js --firststart`


### 3. To start from a specific block number 

1. Identify a block number that is the start of a round, then pass that into the node process. 
❗ Make sure this startBlock is always at the start of a round and you must include the producername also.
2. Important to also add --testing, otherwise it will automatically start from the last round saved in the monitoring table.
❗ --testing is only to be used when starting from specific position.

`node streamingBlocks.js --startBlock 237204032  --producer sentnlagents --testing`


### 4. Disable irreversibility which allows for faster testing.

`node streamingBlocks.js --irreversible false`


### 5. To monitor the process is still running you can call the /monitoring fastify route:

After every round completion the last block is saved as reference, and all prior entries are deleted.

```curl http://localhost:8001/monitoring 
{"owner_name":"guild.waxdao","block_number":272521326,"date":"2023-10-19 16:13:11.500000","first_in_schedule":true}  
```

### 6. To replay older blocks where schedule changes have happened, you can pass in the schedules like so.

 - `--no-livestream`  Disable the live streaming so the schedule doesn't update
 - `--scheduleChangedatBlock` Specify at which block did the schedule change
 - `--newschedule` The new schedule as per block where schedule changed
 - `--schedule` The current schedule before schedule change

```node streamingBlocks.js --no-livestream  --scheduleChangedatBlock 272414959 --startBlock 272413975 --producer guild.nefty --testing --newschedule '[guild.nefty,alohaeosprod,liquidstudio,eosiodetroit,ivote4waxusa,eosriobrazil,bountyblokbp,eosdacserver,teamgreymass,nation.wax,eosauthority,amsterdamwax,blacklusionx,ledgerwiseio,cryptolions1,guild.taco,3dkrenderwax,waxswedenorg,waxhiveguild,eosphereiobp,bp.wecan]' --schedule '[guild.nefty,alohaeosprod,liquidstudio,eosiodetroit,ivote4waxusa,eosriobrazil,bountyblokbp,teamgreymass,nation.wax,eosauthority,amsterdamwax,blacklusionx,ledgerwiseio,cryptolions1,guild.taco,3dkrenderwax,waxswedenorg,waxhiveguild,eosphereiobp,bp.wecan,guild.waxdao]' > test.log```

#### Documentation for swagger

Documentation for the API can be found at /documentation


### To do:

1. Complete Docker setup 


## Docker stuff

The application is containerized using Docker and docker-compose. The setup includes:

1. **Application Container**:
   - Runs both streamingBlocks.js and fastify server
   - Auto-configured with environment variables
   - Built from Node.js 18

2. **Database Container**:
   - PostgreSQL 13
   - Persistent data storage
   - Auto-initialized with schema from `postgresql.sql`
   - Creates database `missingwax` with all required tables
   - Creates user `waxuser` with necessary permissions
   - Exposed on configured port (default 5432)


### Accessing Services
- Fastify API: http://localhost:3000
- PostgreSQL: localhost:5432 (credentials from .env file)
- Swagger docs: http://localhost:3000/documentation

### Database Schema
The following tables are automatically created on first startup:
- `missingwax.producer`: List of producers on chain
- `missingwax.unregbot`: Producers pending removal
- `missingwax.missingblocks`: Missing blocks and rounds
- `missingwax.emptyblocks`: Blocks with zero transactions
- `missingwax.schedules`: Producer schedules
- `missingwax.monitoring`: Block monitoring data

## ENV Variables

|ENV & ARG                 |Value                          |Description                                   |
|--------------------------|---------------------------------------|--------------------------------------|
|**PGUSER**                |`postgresuser`                         | PostgreSQL username                  |
|**DB_PASSWORD**           |`missinguser`                          | PostgreSQL Password                  |
|**PGDB**                  |`missingdb`                            | PostgreSQL DB                        |
|**PGHOST**                |`missingpw`                            | PostgreSQL Host      	              |
|**PGPORT**                |`5432`                                 | PostgreSQL Port                      |
|**SHIPHOST**              |`http://88.198.18.252:28888`           | SHIP host                            |
|**HYPERIONHOST**          |`http://88.198.18.252:7000`            | Hyperion Host                        |
|**STREAMINGHOST**         |`ws://88.198.18.252:29876`             | Streaming Host                       |

> **Note**: All environment variables can be configured in the `.env` file. Docker Compose will automatically pick up these values - no need to pass them manually on the command line.

### Running both mainnet and testnet instances
To run multiple instances of the application using different configurations:

1. Create different env files for each instance:
```bash
cp defaults.env .env.mainnet
cp defaults.env .env.testnet
```

2. Modify the database host in each env file:
```bash
# In .env.mainnet
PGHOST=mainnet-db

# In .env.testnet
PGHOST=testnet-db
```

3. Start each instance with its own env file:
```bash
# Start first instance
docker-compose --env-file .env.mainnet -p mainnet up -d

# Start second instance
docker-compose --env-file .env.testnet -p testnet up -d
```

4. Stop specific instances:
```bash
docker-compose -p mainnet down
docker-compose -p testnet down
```


### UPGRADES


```ALTER TABLE missingwax.monitoring
RENAME COLUMN last_in_schedule TO first_in_schedule;```

restart with --firstart run for 5 minutes then start as normal
restart fastify 
```


