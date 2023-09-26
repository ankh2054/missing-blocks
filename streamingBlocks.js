import { StateReceiver } from 'eosio-statereceiver-sentnl';
import axios from 'axios';
import { addProducers,addMissingBlock,addEmptyBlock,addSchedule,getLatestSchedule,saveToMonitoring,getLatestMonitoringData } from './pgquery.js';
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
    let version, schedule, producers;

    // Check if proposed schedule exists and use its data, otherwise use the active schedule
    if (proposedSchedule !== null) {
      version = proposedSchedule.version;
      producers = proposedSchedule.producers;
      schedule = producers.map(producer => producer.producer_name);
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
    const response = await axios.get(`${hyperionHost}/v1/chain/get_block_header_state?block_num_or_id=${block_num_or_id}`);
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
      console.log('Match found in block header state')
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



async function fetchBlocks(params) {
  const url = `${hyperionHost}/v2/history/get_actions`;
  let response;

  try {
    response = await axios.get(url, { 
        params: {
            limit: 100,
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
  
  let lastProducer = null;
  let blockCount = 0;
  for (const action of response.data.actions) {
    const producer = action.producer; // Make sure to access the correct field
    
    if (producer === lastProducer) {
      blockCount++;
    } else {
      lastProducer = producer; // Update lastProducer every time a new producer comes in
      blockCount = 1;
    }

    if (blockCount === 12) { // If a producer has produced 12 blocks in a row
      return {
        timestamp: action.timestamp,
        producer: action.producer,
        block: action.block_num
      }; 
    }
  }

    throw new Error('No fully produced round found');
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
let previousMissedBlocks = {};
let schedulePosition = 0;
let scheduleProducers = [];
let oldSchedule = [];
let scheduleChangedInThisRound = false;
let scheduleChangePosition = 0;
let headBlockNum; 
let totalMissedBlocks = 0; 

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
          const blockHeaderState = await fetchBlockHeaderState(block_num_or_id, pendingScheduleVersion);
          console.log(blockHeaderState.data)
          
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
setInterval(async () => {
  try {
    // Fetch the current schedule version from the chain
    const { version,schedule } = await fetchscheduleVersion();
    console.log(`Version: ${version}`)
    console.log(`currentScheduleVersion: ${currentScheduleVersion}`)
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
    console.log(`realtimeSchededulefeed is running ${block_num}`)
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
  console.log(block_num)
  console.log(block.producer)
  let producer = block.producer;
  let block_num_lib = block_num;
  let timestamp = block.timestamp;

// Schedule changed at block
  if (block_num_lib === scheduleChangedatBlock) {
    console.log(`The current block number is ${block_num_lib} and the schedule changed at block: ${scheduleChangedatBlock}`);
    console.log(`Schedule is being updated to version ${pendingScheduleVersion}`);
    console.log(`New producer schedule is: ${newschedule}`);
    console.log(`Old producer schedule is: ${schedule}`);

    oldSchedule = schedule; // assign current schedule as oldschedule for later reference
    schedule = newschedule; // assign newschedule to schedule
    scheduleChangedInThisRound = true;
    scheduleChangePosition = oldSchedule.indexOf(producer);  //At what producer position did the schedule change.
    await addSchedule(pendingScheduleVersion, scheduleChangedatBlock, timestamp, producer, scheduleChangePosition, newschedule);
    //scheduleProducersOld = getListFromPosition(oldSchedule, schedulePosition);
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

  // Check for producer change, then look at previous producer array and perform count and if less than 12 deduct from endblock.
  // If the current producer does not equal to current producer, we are now in a new producers round. 
  if (producer !== previousProducer) {
    if (producerBlocks[previousProducer]) {
        let currentProduced = producerBlocks[previousProducer].length;
        if (currentProduced < 12) {
            let missedBlocks = 12 - currentProduced;
            totalMissedBlocks += missedBlocks; // Accumulate missed blocks
            previousMissedBlocks[previousProducer] = missedBlocks; // Store the missed blocks value
            console.log(`${previousProducer} missed ${missedBlocks} block(s)`);
        } else if (currentProduced >= 12 && previousMissedBlocks[previousProducer]) {
            totalMissedBlocks -= previousMissedBlocks[previousProducer]; // Deduct the previous missed blocks value
            delete previousMissedBlocks[previousProducer]; // Clear the value since it's compensated
            console.log(`${previousProducer} misses have been cleared`);
        }
    }
}

  // To calculate the endBlock of the current Round
  let blocksPerRound = scheduleProducers.length * 12;
  let endBlock = startBlock + blocksPerRound - 1 - totalMissedBlocks;

  // Some logging
  console.log(`Start Block for round ${startBlock}`);
  console.log(`End block for round ${endBlock}`);
  //console.log(`Current schedule position is ${schedulePosition}`);
  console.log(`Current blocks for this round ${blocksPerRound}`);
  console.log(`Current block number: ${block_num_lib}`);
  console.log(`Current Producer: ${producer}`);
  console.log(`Timestamp: ${timestamp}`);
  // Set  producer for use in next block
  previousProducer = producer;
  console.log(`Previous Producer: ${previousProducer}`);

  // If the current block number is equal to endBlock, calculate each producer's block count
  if (block_num_lib === endBlock) {
    // If the schedule changed during this round, then combine old and new schedule accordingly.
    if ( scheduleChangedInThisRound ){
      scheduleProducers = combineSchedules(oldSchedule, schedule, scheduleChangePosition);
    }
    console.log(`Producer Schedule ${scheduleProducers}`)
    for (let p of scheduleProducers) {
      console.log(`Current Producer ${p}`);
      // To count missing rounds
      if (producerBlocks[p] === undefined) {
        let producerIndex = scheduleProducers.indexOf(p);
        let blockNum;
        // If the producer isn't the first one in the schedule
        if (producerIndex !== 0) {
            let precedingProducer = scheduleProducers[producerIndex - 1];
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
              blockNum = endBlock - scheduleProducers.length * 12 + producerIndex * 12 + 1;
              timestamp = new Date(data.content['@timestamp']);
              timestamp.setSeconds(timestamp.getSeconds() - scheduleProducers.length * 12 * 0.5 + producerIndex * 12 * 0.5);
            }
          }
          // If the producer is the first one in the schedule, use the previous calculation
          else {
            blockNum = endBlock - scheduleProducers.length * 12 + producerIndex * 12 + 1;
            timestamp = new Date(data.content['@timestamp']);
            timestamp.setSeconds(timestamp.getSeconds() - scheduleProducers.length * 12 * 0.5 + producerIndex * 12 * 0.5);
          }
        let missingBlocksCount = 12;
        console.log(`Producer ${p} missed a round at ${timestamp}, ${blockNum}`)
        await addMissingBlock(p, blockNum, timestamp, true, false, missingBlocksCount);

      // Count missing blocks
      } else if (producerBlocks[p].length < 12) {
        console.log(`${p} produced ${producerBlocks[p].length}`);
        console.log(producerBlocks[p]);
        let missingBlocksCount = 12 - producerBlocks[p].length;
        let missedBlock = findMissedBlock(producerBlocks[p]);
        console.log(`Producer ${p} missed block(s) at ${missedBlock.timestamp}, ${missedBlock.blockNum}`);
        await addMissingBlock(p, missedBlock.blockNum, missedBlock.timestamp, false, true, missingBlocksCount);
        }
      }

    // Reset Schedule Change parameters for the next time.
      if (scheduleChangedInThisRound) {
        oldSchedule = null;
        scheduleChangedInThisRound = false;
      }

      // Reset the counters for the next round and save monitoring
      saveToMonitoring(block_num_lib,timestamp)
      startBlock = endBlock + 1;
      console.log("The current round has ended:", schedule);
      schedulePosition = 1;
      producerBlocks = {};
      previousMissedBlocks = {};
      totalMissedBlocks = 0;
  }
}


async function main() {

  // Set Command arguments if present
  const startBlockArgIndex = process.argv.findIndex(arg => arg === '--startBlock');
  const testingArgIndex = process.argv.findIndex(arg => arg === '--testing');
  const firststartArgIndex = process.argv.findIndex(arg => arg === '--firststart');
  const producerArgIndex = process.argv.findIndex(arg => arg === '--producer');
  const irreversibleArgIndex = process.argv.findIndex(arg => arg === '--irreversible');


  // Set variables for main() start function
  let producerStart; // Variable that will be assigned ith the starting producer 
  let lastSavedBlock; // Last save block in monitoring DB
  let irreversible = true; // set irreversible value - defauklt is true

  //1. Assign the current schedule 
  let result = await fetchCurrentSchedule();
  schedule = result.schedule;
  startversion = result.version;
  
  //2. Get headblock numnber:
  headBlockNum = await getHeadBlock();
  //getHeadBlock().then((num) => {
  //  headBlockNum = num;
  //})


  // 3. The last block from that fully produced round + 1 = the block where the next producer will start
  // Check if a startBlock argument was passed in, then check whether latest chain scheduleNumber equals what was saved in our DB.
  // This ensures we only allow to start from a past block if the schedule's never changed, otherwise we will be reading blocks based on the 
  // wrong schedule and incorrectly recording missed rounds. 
  // IMPORTANT!! Make sure startBlock is always at the start of a new round.
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
      // If testing or firststart argument has been passed we will start from random position.
      if (testingArgIndex !== -1 || firststartArgIndex !== -1) {
        //Get now date
        const now = new Date();
        let timestamp = now.toISOString();
        timestamp = timestamp.substring(0, timestamp.length - 5) + ".500Z";
        const params = {
          start_from: timestamp 
        };
        // Set a start from 30 seconds befere now date
        params.start_from = subtractTime(params.start_from, 30);
        // Set a read until for 10 seconds after now date
        params.read_until = AddTime(params.start_from, 10);
        // Pass date paramaters to fetchblocks to obtain last fully produced round producer and block number.
        const result = await fetchBlocks(params);
        startBlock = result.block + 1;
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
          startBlock = lastSavedBlock.block_number + 1;
          producerStart = schedule[0];
      }

  }
  // 4. Used for testing to only read_until a certain timestamp or block
  //const read_until = '2023-05-02T07:57:30.000Z'

  // 5. Assigns the schedule position and current Producer
  // If --producer was used it will assign that to producerName, otherwise it use the producer from results.producer which was assigned to producerStart. 
  let producerName = producerArgIndex !== -1 && process.argv[producerArgIndex + 1] ? process.argv[producerArgIndex + 1] : producerStart ;
  let producerIndex = schedule.indexOf(producerName);
  // if no --producername was passed obtain the current index of the producer found from result.block
  if (producerIndex !== -1) {
    currentProducerIndex = (producerIndex + 1) % schedule.length;
    // Set the current schedule position. If passing in a producerName no need for +1 as we are not moving to the next producer.
    // If we pass --testing or --startfirst then it will automatically find a suitable place to start and we therefore need the + 1
    schedulePosition = (testingArgIndex !== -1 || firststartArgIndex !== -1) ? currentProducerIndex + 1: (currentProducerIndex);
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
 srlibFalse.start();

}

main();