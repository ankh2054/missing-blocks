import { StateReceiver } from 'eosio-statereceiver-sentnl';
import axios from 'axios';
//import { sha256 } from 'js-sha256';
import { addProducers,addMissingBlock } from '../pgquery.js';
import { shiphost,hyperionhost,streaminghost } from '../config.js';


const shipHost = shiphost
const hyperionHost = hyperionhost
const streamingHost = streaminghost
let schedule;

 
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
    console.log(version, schedule)
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
    //console.log(action)
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

let currentProducer = 'wizardsguild';  // Set producer to start with 
let startBlock = 231248930;   // Set starting block
let currentScheduleVersion //= 629; 
let pendingScheduleVersion //= 629; 
let isCheckingSchedule = false;
let scheduleChangedatBlock = Infinity;  // To ensure the schedule isn't updated on first run
let newschedule
let intervalCheck = true;
let producerBlocks = {};
let schedulePosition = 5;  // Set current producers schedule
let scheduleProducers = [];
let oldSchedule = [];
let scheduleChangedInThisRound = false;
let scheduleChangePosition = 0;
let headBlockNum; 

(async function() {
  let result = await fetchCurrentSchedule();
  currentScheduleVersion = result.version;
})();


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
  
  // To calculate the endBlock of the current Round
  let blocksPerRound = scheduleProducers.length * 12;
  let endBlock = startBlock + blocksPerRound - 1;

  // Some logging
  console.log(`Start Block for round ${startBlock}`);
  console.log(`End block for round ${endBlock}`);
  console.log(`Current schedule position is ${schedulePosition}`);
  console.log(`Current blocks for this round ${blocksPerRound}`);
  console.log(`Current block number: ${block_num_lib}`);
  console.log(`Current Producer: ${producer}`);
  console.log(`Timestamp: ${timestamp}`);

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

      // Reset the counters for the next round
      startBlock = endBlock + 1;
      console.log("The current round has ended:", schedule);
      schedulePosition = 1;
      producerBlocks = {};
  }
}


async function main() {
 


 const srlibTrue = new StateReceiver({
    //logger: {
    //info: (...m) => console.info(...m),
    //debug: (...m) => console.debug(...m),
    //warn: (...m) => console.warn(...m),
    //error: (...m) => console.error(...m),
    //},
    startBlock: startBlock,
    irreversible: true,
    socketAddresses: [streamingHost],
    eosEndpoint: shipHost,
    deserializerActions: [

    ],
    maxQueueSize: 100,  //INCREASE QUEUE SIZE
 });

 srlibTrue.registerTraceHandler({
    async processTrace(block_num, traces, block) {
    //await sleep(1000);
    await missingBlockSchededulefeed(block_num,block)
    
    },
 });



 srlibTrue.onError = (err) => {
    sr.stop();
    console.error(`State receiver LIB equals true stop due to ERROR:`, err);
 };



 srlibTrue.start();


}
//updateScheduleWhenReady('222808285', '37652');
//fetchBlockHeaderState(229669588, 37745).then(result => console.log(result));
main();