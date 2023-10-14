## Stack

### 0. Set .ENV variables acordingly

- `cp defaults.env  .env` 
- `cp defaults.env fastify/.env`


### 1. fastify/ API and Swagger documentation 
`npm start`

### 2. streamingBlocks.js - Capture missing blocks and saves to DB.
`node streamingBlocks.js`

- By default when the process starts it will check the monitoring table for the last round saved and automatically start from the next round.The monitoring table will always contain the last block of a round.

If starting this process for a brand new chain OR starting from a blank slate use the --firststart option
`node streamingBlocks.js --firststart`


### 3. To start from a specific block number 

1. Identify a block number that is the start of a producers round, then pass that into the node process. 
❗ Make sure this startBlock is always at the start of a producers round and you must include the producername also. This is important to ensure it can work out the schedule position.
❗ Note this cxan never be the last producer of a round.
2. Important to also add--testing, otherwise it will automatically start from the last round saved in the monitoring table. 

`node streamingBlocks.js --startBlock 237204032  --producer sentnlagents --testing`


#### 4. For testing you can also disable irreversibility which allows for faster testing.

`node streamingBlocks.js --irreversible false --testing`


#### 5. To monitor the process is still running you can call the /monitoring fastify route:

After every round completion the last block is saved as reference, and all prior entries are deleted.

```curl http://localhost:8001/monitoring 
{"block_number":237259985,"date":"2023-09-12T11:48:17.500Z"}%     
```



#### Documentation for swagger

Documentation for the API can be found at /documentation


### To do:

1. Complete Docker setup 


## Docker stuff


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



```
docker-compose run \
-e PGUSER=postgres \
-e DB_PASSWORD=mysecretpassword \
-e PGDB=misssngdb  \ 
-e PGHOST=postgres \ 
-e PGPORT=5432 \ 
-e SHIPHOST=http://88.198.18.252:28888 \ 
-e HYPERIONHOST=http://88.198.18.252:7000 \ 
-e STREAMINGHOST=ws://88.198.18.252:29876 
```


#### UPDATES

ALTER TABLE missingwax.monitoring ADD COLUMN last_in_schedule BOOLEAN;


Restart streamingBlocks.js
Restart fastify/server.js
Update check_oig.py in nagios 