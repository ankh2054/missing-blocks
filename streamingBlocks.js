import { StateReceiver } from 'eosio-statereceiver-sentnl';
import axios from 'axios';
import { addProducers,addMissingBlock,addEmptyBlock,addSchedule,getLatestSchedule,saveToMonitoring,getLatestMonitoringData, addProducerToUnregbot,clearUnregbotTable } from './pgquery.js';
import { shipHost,hyperionHost,streamingHost,recordEmptyBlocks} from './config.js';



let currentProducer = null;
let schedule;
let startversion;

 
function getListFromPosition(schedule, schedulePosition) {
  // Check if schedulePosition is within the schedule's length
  if(schedulePosition < 1 || schedulePosition > schedule.length) {
    console.log('Invalid schedulePosition. Please provide a valid position.');
    return;
  }
  
  // JavaScript array indices start from 0, so we subtract 1 from the schedulePosition
  schedulePosition = schedulePosition - 1;

  // Use slice() to get the elements starting from schedulePosition to the end of the array
  let result = schedule.slice(schedulePosition);
  
  return result;
}


async function getHeadBlock(){
    const response = await axios.get(`${shipHost}/v1/chain/get_info`);
    var headBlockNum = parseInt(response.data.head_block_num);
    return headBlockNum;
}

async function fetchCurrentSchedule() {
  try {
    let schedule = [];
    const response = await axios.get(`${shipHost}/v1/chain/get_producer_schedule`);
    const version = parseInt(response.data.active.version);
    response.data.active.producers.forEach(producer => {
      schedule.push(producer.producer_name);
     });

    // return both version and schedule (which is producers list)
    //console.log(version, schedule)
    // Save Producers to database and only add new ones, used to reference in missing block data
    return { version, schedule };
    
  } catch (error) {
    console.error('Error:', error);
    return {}; // return empty object in case of error
  }
}

// Update this to fecth both versions from V1 and always provide the second instance of the version 
// As /v2/history/get_schedule will always only provide the new version.
// Does /v2/history/get_schedules new version and new schedule or only new version is pending?
async function fetchscheduleVersion() {
  try {
    const response = await axios.get(`${shipHost}/v1/chain/get_producer_schedule`);
    let activeSchedule = response.data.active;
    let proposedSchedule = response.data.proposed;
    let version, schedule, producers

    // Check if proposed schedule exists and use its data, otherwise use the active schedule
    if (proposedSchedule !== null) {
      version = proposedSchedule.version;
      producers = proposedSchedule.producers;
      schedule = producers.map(producer => producer.producer_name);
      // Get list of current active producers
      let producersActive = activeSchedule.producers;
      let scheduleActive =  producersActive.map(producer => producer.producer_name);
      // This will give you producers that are in Active schedule but not in the proposed schedule
      let uniqueActiveProducers = scheduleActive.filter(producer => !schedule.includes(producer));
      console.log('Producers in active schedule but not in proposed:', uniqueActiveProducers);
      // Add each unique active producer to the unregbot table
      uniqueActiveProducers.forEach(async (producerName) => {
        try {
            await addProducerToUnregbot(producerName);
            console.log(`Added ${producerName} to unregbot table.`);
        } catch (error) {
            console.error(`Failed to add ${producerName} to unregbot table: ${error}`);
        }
      });
    } else {
      version = activeSchedule.version;
      producers = activeSchedule.producers;
      schedule = producers.map(producer => producer.producer_name);
    }

    console.log(version, schedule)
    // return both version and schedule 
    return { version, schedule };
    
  } catch (error) {
    console.error('Error:', error);
    return {}; // return empty object in case of error
  }
}


async function fetchBlockHeaderState(block_num_or_id, pendingScheduleVersion) {
  try {
    const response = await axios.post(`${shipHost}/v1/chain/get_block_header_state`, {
      block_num_or_id: block_num_or_id
    });
    const blockStateVersion =  parseInt(response.data.active_schedule.version);
    const producers = response.data.active_schedule.producers;
    const producerNames = producers.map(producer => producer.producer_name);
    pendingScheduleVersion = parseInt(pendingScheduleVersion); // Parse pendingScheduleVersion into integer
    console.log(`Pending version: ${pendingScheduleVersion} vs ${blockStateVersion} `)
    console.log(`block_num:  ${block_num_or_id} `)

    if(blockStateVersion === pendingScheduleVersion) {
      console.log('Schedule Match found in block header state')
      return {
        match: true,
        producerNames
      };
    } else {
      console.log('Match not found in block header state')
      return {
        match: false,
        producerNames
      };
    }
  } catch (error) {
    console.error('Error:', error);
  }
}

// usage



async function fetchBlocks(params,schedule) {

  const url = `${hyperionHost}/v2/history/get_actions`;
  let response;

  try {
    response = await axios.get(url, { 
        params: {
            limit: 1000,
            account: 'eosio',
            'act.name': 'onblock',
            after: params.start_from,
            before: params.read_until,
            sort: 'asc'
        }
    });
  } catch (error) {
    console.error('Error making API call:', error);
    throw error;
  }
  if (!response.data || !Array.isArray(response.data.actions)) {
    console.error('Invalid response from API:', response.data);
    throw new Error('Invalid response from API');
  }
  let firstProducer = schedule[0];
  let lastProducer = null;
  let foundFirstProducer = false;
  for (const action of response.data.actions) {
    const producer = action.producer; // Make sure to access the correct field
    
    if (producer === firstProducer && lastProducer !== firstProducer) {
      foundFirstProducer = true;
    } else {
      lastProducer = producer; // Update lastProducer every time a new producer comes in
    }

    if (foundFirstProducer) { // If a block by firstProducer is found after a block by another producer
      return {
        timestamp: action.timestamp,
        producer: action.producer,
        block: action.block_num
      }; 
    }
  }

  throw new Error('No block found by firstProducer after a block by another producer');
}

function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }


function subtractTime(timestamp, amount) {
  let date = new Date(timestamp);
  date.setSeconds(date.getSeconds() - parseInt(amount));
  return date.toISOString();
}

function AddTime(timestamp, amount) {
  let date = new Date(timestamp);
  date.setSeconds(date.getSeconds() + parseInt(amount));
  return date.toISOString();
}
function findMissedBlock(blocks) {
  console.log(blocks);
  if (blocks.length > 0) {
    let { timestamp, blockNum } = blocks[0];
    return { timestamp, blockNum };
  }
  
  return null;
}


let currentProducerIndex = -1;
let previousProducer = null;
let currentScheduleVersion //= 629; 
let pendingScheduleVersion //= 629; 
let isCheckingSchedule = false;
let scheduleChangedatBlock = Infinity;  // To ensure the schedule isn't updated on first run
let newschedule
let intervalCheck = true;
let startBlock;
let producerBlocks = {};
let schedulePosition = 0;
let scheduleProducers = [];
let oldSchedule = [];
let scheduleChangedInThisRound = false;
let scheduleChangePosition = 0;
let headBlockNum; 
let endBlock = 0;
let blocksPerRound = 0;
let CheckSchedulePosition = true;
let lastProducerInRound = null;


(async function() {
  let result = await fetchCurrentSchedule();
  currentScheduleVersion = result.version;
})();


// Check whether block contains any transactions
function areTransactionsEmpty(transactions) {
  // Check if transactions array is empty
  if (transactions.length === 0) {
    return true;
  }

  // Check if all trx arrays inside transactions are empty
  for (let transaction of transactions) {
    if (transaction.trx.length !== 0) {
      return false;
    }
  }

  return true;
}

// Function that continuously fetches block header state until new schedule is detected
async function updateScheduleWhenReady(block_num_or_id, pendingScheduleVersion) {
  while (true) {
      try {
          console.log("Waiting for new schedule to show in Blockheader state");
          await sleep(100);
          const blockHeaderState = await fetchBlockHeaderState(block_num_or_id, pendingScheduleVersion);
          //if (blockHeaderState !== undefined) { // Check if blockHeaderState is not undefined
              console.log(`Checking Block number header state: ${block_num_or_id}`);

              if (blockHeaderState.match === true) {
                  // Assign the block number where the schedule changed
                  scheduleChangedatBlock = block_num_or_id;
                  // Assign the new schedule to will take effect once that block is reached.
                  newschedule = blockHeaderState.producerNames;
                  currentScheduleVersion = pendingScheduleVersion;
                  // set checking for schedule to False for the next schedule change
                  isCheckingSchedule = false;
                  // Now that schedule has been updated we can once again start checking for new schedules.
                  intervalCheck = true;
                  console.log("Schedule updated successfully.");
                  break;
              }
          //}

          // We directly proceed to the next block without waiting
          block_num_or_id++;
      } catch (error) {
          console.log("An error occurred: ", error);
          // Optionally, if you want to retry after a specific amount of time, you can use setTimeout here.
          await new Promise(resolve => setTimeout(resolve, 1000));
          continue; // Use 'continue' statement to ensure that the loop won't increment block_num_or_id when an error occurs.
      }
  }
}


// Set up the interval
// Combine both versions and asses which one is being removed.
setInterval(async () => {
  try {
    // Fetch the current schedule version from the chain
    const { version,schedule } = await fetchscheduleVersion();
    console.log(`Version: ${version}`)
    console.log(`currentScheduleVersion: ${currentScheduleVersion}`)
    // Update prouders to ensure we have all teh producers
    await addProducers(schedule);


    if (version !== currentScheduleVersion && intervalCheck) {
      console.log("Schedule version has changed and we are not already checking. Updating...");
      // Update the pending schedule version
      pendingScheduleVersion = version;
      // Set is checking to True
      isCheckingSchedule = true;
      // Set interval check to false so we don't check for new schedules until the new one has been updated
      intervalCheck = false;
    }
  } catch (error) {
    console.error("Error in schedule version check interval:", error);
  }
}, 60000); // Runs every 60 seconds


// Core function - Streaming realtime blocks (not lib)
async function realtimeSchededulefeed(block_num){
    //console.log(`realtimeSchededulefeed is running ${block_num}`)
    // Check if there is a pending schedule update and we're not already checking
    if (currentScheduleVersion !== pendingScheduleVersion && isCheckingSchedule && !intervalCheck) {
        console.log('Running schedule updater')
        // Set the isCheckingSchedule to false, so this process doesn't run again as we have now scheduled the process to check for the new schedule
        isCheckingSchedule = false
        // Start the process of fetching and updating the schedule
        setTimeout(function(){
            updateScheduleWhenReady(block_num, pendingScheduleVersion);
        }, 30000); // Delay of 30 seconds
    }
}


function combineSchedules(oldSchedule, newSchedule, scheduleChangePosition) {
  // Create a new array to store the combined schedule
  let combinedSchedule = [];
  
  // Iterate over old schedule and add to combined schedule if before change
  for(let i = 0; i < oldSchedule.length; i++){
      if(i < scheduleChangePosition) {
          combinedSchedule.push(oldSchedule[i]);
      }
  }
  
  // Iterate over new schedule and add to combined schedule if at or after change
  for(let i = 0; i < newSchedule.length; i++){
      if(i >= scheduleChangePosition && !combinedSchedule.includes(newSchedule[i])) {
          combinedSchedule.push(newSchedule[i]);
      }
  }
  
  return combinedSchedule;
}

async function missingBlockSchededulefeed(block_num,block){
  console.log(`-------------------------------`);
  let producer = block.producer;
  let block_num_lib = block_num;
  let timestamp = block.timestamp; 
  //let lastProducerInRound = null;
  let totalBlocksInRound = 0;
  
  //Schedule changed at block
  if (block_num_lib === scheduleChangedatBlock) {
    oldSchedule = schedule; // assign current schedule as oldschedule for later reference
    await clearUnregbotTable();
    if (CheckSchedulePosition) {
      scheduleChangePosition = oldSchedule.indexOf(producer); // At what producer position did the schedule change.
      console.log(`Schedule change position ${scheduleChangePosition}`);
    }
    // If schedule changed at position 0 the increment by 1, so we don't count the schedule changes against the previous round.
    if (scheduleChangePosition === 0) {
      console.log(`Schedule changed at Position 0 so incrementing with 1`)
      scheduleChangedatBlock += 1;
      scheduleChangePosition = 1;
      CheckSchedulePosition = false;
    } else {
      console.log(`The current block number is ${block_num_lib} and the schedule changed at block: ${scheduleChangedatBlock}`);
      console.log(`Schedule is being updated to version ${pendingScheduleVersion}`);
      console.log(`New producer schedule is: ${newschedule}`);
      console.log(`Old producer schedule is: ${schedule}`);

      //Re-assign schedule change position for DB entry
      scheduleChangePosition = oldSchedule.indexOf(producer);
      schedule = newschedule; // assign newschedule to schedule
      scheduleChangedInThisRound = true;
      await addSchedule(pendingScheduleVersion, scheduleChangedatBlock, timestamp, producer, scheduleChangePosition, newschedule);
    }
  }

  // Get the producers for the current round based on where we started. During startup process can start in middle of round.
  scheduleProducers = getListFromPosition(schedule, schedulePosition);

  // Initialize the array for the current producer
  if (producerBlocks[producer] === undefined) {
    producerBlocks[producer] = [];
  }
  
  // Add the current block to the producer's array
  producerBlocks[producer].push({ blockNum: block_num_lib, timestamp: timestamp });

  // Check if Block is empty and record accordingly 
  if (recordEmptyBlocks && areTransactionsEmpty(block.transactions)) {
    console.log(`${block_num} recorded as an empty block`);
    await addEmptyBlock(producer, block_num, timestamp, true);
  }
 

  // To calculate the endBlock of the current Round
  blocksPerRound = scheduleProducers.length * 12;


  
  //console.log(`Current schedule position is ${schedulePosition}`);
  console.log(`Current blocks for this round ${blocksPerRound}`);
  console.log(`Current block number: ${block_num_lib}`);
  console.log(`Current Producer: ${producer}`);
  console.log(`Previous Producer: ${previousProducer}`);
  console.log(`Timestamp: ${timestamp}`);


  // Increment the total block count
  totalBlocksInRound++;


// Assuming you have a way to track the previous and current producers
let previousProducerIndex = schedule.indexOf(previousProducer);
let currentProducerIndex = schedule.indexOf(producer);

// Assuming 'lastProducerInRound' is updated to the expected last producer of each round
let expectedLastProducerIndex = schedule.length - 1; // Index of 'guild.waxdao'

// If the producer has changed
if (previousProducer !== null && producer !== previousProducer) {
    console.log(`Producer change detected`)
    console.log(`Last producer in round ${lastProducerInRound}`)
    let blockNum
    // ROUND COMPLETION CODE
    // If we've looped back to the start of the schedule 
    // OR the first producer(s) missed their round(s)
    // OR we've seen the expected number of blocks for a round, we know we have completed a round.
    if (producer === schedule[0] || // Are we back to first producer in schedule
        (previousProducerIndex === expectedLastProducerIndex && currentProducerIndex !== 0) ||
        totalBlocksInRound >= 12 * schedule.length) {
        console.log(`We have completed a round checking for missing blocks`)
        // If the schedule changed during this round, then combine old and new schedule accordingly.
        // If scheduleChangePosition is 0 then don't combine this round.
        if ( scheduleChangedInThisRound ){
          console.log('Schedule changed in this round'); 
          // Get the producer name from the old schedule using the schedule change position
          let oldProducerName = oldSchedule[scheduleChangePosition];
          // Account for the schedule changing mid producer round.
          // If the schedule changed at position 13 for example and the producer in position from the old schedule produced a single block, the producer in the new schedule in position 13 will now only have to produce 11 blocks.
          if (producerBlocks[oldProducerName] && producerBlocks[oldProducerName].length > 0) {
            console.log('Looks like schedule changed mid producer round');
            // Make a note of these entries
            let oldProducerEntries = producerBlocks[oldProducerName];

            // Get the producer name from the new schedule using the schedule change position
            let newProducerName = newschedule[scheduleChangePosition];
            console.log(`Adding ${ oldProducerEntries.length} block from ${oldProducerName} towards ${newProducerName} block count`);
            // Add the old producer's entries to the new producer's entries in producerBlocks
            producerBlocks[newProducerName] = producerBlocks[newProducerName].concat(oldProducerEntries);
          }
          scheduleProducers = combineSchedules(oldSchedule, schedule, scheduleChangePosition);
        }
        console.log(`Producer Schedule ${scheduleProducers}`)
        console.log(`-------------------------------`);
        //Remove the current block for the producer as we are technically in a new round so it cannot count as an addition.
        producerBlocks[producer] = producerBlocks[producer].slice(0, -1);
      // We've completed a round, so check for missing blocks
      for (let p of scheduleProducers) {
        console.log(`Checking for missing blocks for ${p}: Blocks produced ${producerBlocks[p] ? producerBlocks[p].length : 0}`)
        if (!producerBlocks[p] || producerBlocks[p].length < 12) {
          let missingBlocks = 12 - (producerBlocks[p] ? producerBlocks[p].length : 0);
          console.log(`Producer ${p} missed ${missingBlocks} block(s)`);
  
          let producerIndex = schedule.indexOf(p);
  
          // If the producer isn't the first one in the schedule
          if (producerIndex !== 0) {
            let precedingProducer = schedule[producerIndex - 1];
            let precedingProducerBlocks = producerBlocks[precedingProducer];
            
            // If the preceding producer produced blocks
            if (precedingProducerBlocks && precedingProducerBlocks.length > 0) {
              // The block number where the producer should have started producing is
              // one more than the last block produced by the preceding producer
              let precedingProducerLastBlock = precedingProducerBlocks[precedingProducerBlocks.length - 1];
              blockNum = precedingProducerLastBlock.blockNum + 1;
          
              // Adjust the timestamp based on the last block produced by the preceding producer
              timestamp = new Date(precedingProducerLastBlock.timestamp);
              timestamp.setSeconds(timestamp.getSeconds() + 0.5);
            }
            // If the preceding producer didn't produce any blocks, fallback to the previous calculation
            else {
              blockNum = endBlock - schedule.length * 12 + producerIndex * 12 + 1;
              timestamp = new Date(block.timestamp);
              timestamp.setSeconds(timestamp.getSeconds() - schedule.length * 12 * 0.5 + producerIndex * 12 * 0.5);
            }
          }
          // If the producer is the first one in the schedule, use the previous calculation
          else {
            block_num_lib = block_num_lib - schedule.length * 12 + 12 // Take schedule length + 12 to account for missed round
            timestamp = new Date(block.timestamp);
            timestamp.setSeconds(timestamp.getSeconds() - schedule.length * 12 * 0.5 + producerIndex * 12 * 0.5);
          }
  
          // If the producer missed the entire round
          if (missingBlocks === 12) {
            console.log(`Producer ${p} missed en entire round  at ${timestamp},  ${block_num_lib}`);
            await addMissingBlock(p, block_num_lib, timestamp, true, false, missingBlocks);
          }
          // If the producer missed some blocks
          else {
            let missedBlock = producerBlocks[p][producerBlocks[p].length - 1];
            console.log(`${p} produced ${producerBlocks[p].length}`);
            console.log(producerBlocks[p]);
            console.log(`Producer ${p} missed block(s) at ${missedBlock.timestamp}, ${missedBlock.blockNum}`);
            await addMissingBlock(p, missedBlock.blockNum, missedBlock.timestamp, false, true, missingBlocks);
          }
        }
      }

      // Reset Schedule Change parameters for the next time.
      // If scheduleChangePosition is 0 then o
      if (scheduleChangedInThisRound) {
        oldSchedule = null;
        scheduleChangedInThisRound = false;
        CheckSchedulePosition = false;
        }

       // Reset the counters for the next round and save monitoring
       console.log(`Saving monitoring data for block ${block_num_lib} at ${timestamp} for producer ${producer}`)
       saveToMonitoring(block_num_lib,timestamp,producer)
       console.log("The current round has ended:", schedule);
       schedulePosition = 1;
       producerBlocks = {};
       // Add the current block first producer in schedule so it doesn't loose out as his current block is counted against previous round.
       producerBlocks[producer] = []; 
       producerBlocks[producer].push({ blockNum: block_num_lib, timestamp: timestamp });
       totalBlocksInRound = 0;
    }

    // If we're starting a new round, remember the last producer
    if (producer === schedule[0]) {
      lastProducerInRound = previousProducer;
    }
  }
  // Set Previous  to current producer for use in next block
  previousProducer = producer;

}


async function main() {

  // Set Command arguments if present
  const startBlockArgIndex = process.argv.findIndex(arg => arg === '--startBlock');
  const testingArgIndex = process.argv.findIndex(arg => arg === '--testing');
  const firststartArgIndex = process.argv.findIndex(arg => arg === '--firststart');
  const producerArgIndex = process.argv.findIndex(arg => arg === '--producer');
  const irreversibleArgIndex = process.argv.findIndex(arg => arg === '--irreversible');
  const scheduleChangedatBlockArgIndex = process.argv.findIndex(arg => arg === '--scheduleChangedatBlock');
  const newscheduleArgIndex = process.argv.findIndex(arg => arg === '--newschedule');
  const scheduleArgIndex = process.argv.findIndex(arg => arg === '--schedule');
  const nolivestreamArgIndex = process.argv.findIndex(arg => arg === '--no-livestream');

  // Set variables for main() start function
  let producerStart; // Variable that will be assigned ith the starting producer 
  let lastSavedBlock; // Last save block in monitoring DB
  let irreversible = true; // set irreversible value - default is true

  //1. Assign the current schedule 
  let result = await fetchCurrentSchedule();
  schedule = result.schedule;
  startversion = result.version;
  
  //2. Get headblock numnber:
  headBlockNum = await getHeadBlock();

  

//3.  To start from a previous block pass old schedules in. 
  if (scheduleChangedatBlockArgIndex !== -1 && process.argv[scheduleChangedatBlockArgIndex + 1]) {
    try {
      scheduleChangedatBlock = parseInt(process.argv[scheduleChangedatBlockArgIndex + 1]);
    } catch (error) {
      console.error('Error parsing --scheduleChangedatBlock argument:', error);
      process.exit(1);
    }
  }
  if (newscheduleArgIndex !== -1 && process.argv[newscheduleArgIndex + 1]) {
    try {
      // Get the argument as a string
      let scheduleString = process.argv[newscheduleArgIndex + 1];
      // Remove the square brackets and split the string into an array
      let scheduleArray = scheduleString.slice(1, -1).split(',');
      // Trim any whitespace from the items
      scheduleArray = scheduleArray.map(item => item.trim());
      // Assign the array to newschedule
      newschedule = scheduleArray;
    } catch (error) {
      console.error('Error parsing --schedule argument:', error);
      process.exit(1);
    }
  }
  if (scheduleArgIndex !== -1 && process.argv[scheduleArgIndex + 1]) {
    try {
      // Get the argument as a string
      let scheduleString = process.argv[scheduleArgIndex + 1];
      // Remove the square brackets and split the string into an array
      let scheduleArray = scheduleString.slice(1, -1).split(',');
      // Trim any whitespace from the items
      scheduleArray = scheduleArray.map(item => item.trim());
      // Assign the array to schedule
      schedule = scheduleArray;
      console.log(`New producer schedule is: ${newschedule}`);
      console.log(`Old producer schedule is: ${schedule}`);
      console.log(`Schedule will change at block: ${scheduleChangedatBlock}`)
    } catch (error) {
      console.error('Error parsing --schedule argument:', error);
      process.exit(1);
    }
  }

  // 4. The last block from that fully produced round + 1 = the block where the next producer will start
  // Check if a startBlock argument was passed in, then check whether latest chain scheduleNumber equals what was saved in our DB.
  // This ensures we only allow to start from a past block if the schedule's never changed, otherwise we will be reading blocks based on the 
  // wrong schedule and incorrectly recording missed rounds. 
  if (startBlockArgIndex !== -1 && process.argv[startBlockArgIndex + 1]) {
    if (producerArgIndex === -1 || !process.argv[producerArgIndex + 1]) {
        console.error(`Error: --startBlock requires --producer argument.`);
        process.exit(1);
    }
    const latestScheduleNumber = await getLatestSchedule();
    if (startversion === latestScheduleNumber) {
        startBlock = parseInt(process.argv[startBlockArgIndex + 1]);
    } else {
        console.error(`Error: On chain schedule version ${startversion} does not match our previously saved schedule number ${latestScheduleNumber}`);
        process.exit(1)
    }
  } else {
      // If testing or firststart argument has been passed we will start from beginning of round.
      if (testingArgIndex !== -1 || firststartArgIndex !== -1) {
        //Get now date
        const now = new Date();
        let timestamp = now.toISOString();
        timestamp = timestamp.substring(0, timestamp.length - 5) + ".500Z";
        const params = {
          start_from: timestamp 
        };
        // Set a start from 240 seconds befere now date
        params.start_from = subtractTime(params.start_from, 240);
        // Set a read until for 100 seconds after now date
        params.read_until = AddTime(params.start_from, 100);
        // Pass date paramaters to fetchblocks to obtain last fully produced round producer and block number.
        const result = await fetchBlocks(params,schedule);
        startBlock = result.block;
        producerStart = result.producer;
      } else {
          lastSavedBlock = await getLatestMonitoringData();
          if (!lastSavedBlock) {
            console.error(`There was no last block saved in your DB, this could be the first time you are running
            this process, please start with the --firststart argument`);
            process.exit(1);
          }
     // Else we recover from the last round that was saved in the monitoring table.
          console.log(`Process starting from lastSavedBlock: ${lastSavedBlock.block_number}`);
          startBlock = lastSavedBlock.block_number;
          producerStart = schedule[0];
      }

  }

  // 5. Assigns the schedule position and current Producer
  // If --producer was used it will assign that to producerName, otherwise it use the producer from results.producer which was assigned to producerStart. 
  let producerName = producerArgIndex !== -1 && process.argv[producerArgIndex + 1] ? process.argv[producerArgIndex + 1] : producerStart ;
  let producerIndex = schedule.indexOf(producerName);
  // if no --producername was passed obtain the current index of the producer found from result.block
  if (producerIndex !== -1) {
    currentProducerIndex = (producerIndex + 1) % schedule.length;
    schedulePosition = currentProducerIndex
    console.log(`Current Schedule Position ${schedulePosition}`)
    currentProducer = schedule[currentProducerIndex];
  } else {
    console.error(`Producer ${producerName} not found in the schedule`);
  }

  // Print statements
  console.log(`Recording empty blocks: ${recordEmptyBlocks}`)
  console.log(`Configured Ship host: ${shipHost}`)
  console.log(`Configured Hyperion host: ${hyperionHost}`)
  console.log(`Configured Ship streaming host: ${streamingHost}`)
  console.log(`startblock: ${startBlock}`)
  console.log(`headBlockNum ${headBlockNum}`)
  console.log(`Current Schedule: ${schedule}`)
  console.log((`Current Schedule version: ${startversion}`))

  // 6. Set value for irreversible to be used in srlibTrue
  if (irreversibleArgIndex !== -1 && process.argv[irreversibleArgIndex + 1]) {
    irreversible = process.argv[irreversibleArgIndex + 1] === 'true';
  }

    // 7. Start streaming blocks and counting  missed rounds and blocks.
  const srlibTrue = new StateReceiver({
      startBlock: startBlock,
      irreversible: irreversible,
      socketAddresses: [streamingHost],
      eosEndpoint: shipHost,
      deserializerActions: [],
      maxQueueSize: 100,  //INCREASE QUEUE SIZE
  });

 srlibTrue.registerTraceHandler({
    async processTrace(block_num, traces, block) {
    //await sleep(1000);
    await missingBlockSchededulefeed(block_num,block)
    
    },
 });

 const srlibFalse = new StateReceiver({
    startBlock: headBlockNum,
    irreversible: false,
    socketAddresses: [streamingHost],
    eosEndpoint: shipHost,
    deserializerActions: [],
    maxQueueSize: 100,
 });

 srlibFalse.registerTraceHandler({
    async processTrace(block_num, traces, block) {
    //await sleep(1000);
    await realtimeSchededulefeed(block_num)
    },
 });

 srlibTrue.onError = (err) => {
    sr.stop();
    console.error(`State receiver LIB equals true stop due to ERROR:`, err);
 };

 srlibFalse.onError = (err) => {
    sr.stop();
    console.error(`State receiver LIB equals false stop due to ERROR:`, err);
 };
  
 srlibTrue.start();
 // If the --no-srlibFalse argument was not passed, start srlibFalse
if (nolivestreamArgIndex === -1) {
  srlibFalse.start();
}

}

main();