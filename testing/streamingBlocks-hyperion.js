import  { HyperionStreamClient } from "@eosrio/hyperion-stream-client";
//import { HyperionStreamClient } from "./lib/esm/index.js";
//const axios = require('axios');
import axios from 'axios';
import { sha256 } from 'js-sha256';
//const sha256 = require('js-sha256').sha256;
import { addProducers,addMissingBlock } from './pgquery.js';



const hyperionHost = "http://88.198.18.252:7000"
const streamingHost = "ws://88.198.18.252:1234" //"ws://88.198.18.252:1234" //ws://atomic-test.oiac.io:5555
let currentProducer = null;
let schedule;

// Assign the current schedule 
fetchCurrentSchedule().then(result => {
    schedule = result.schedule;
});
 
const client = new HyperionStreamClient({
    endpoint: streamingHost,
    debug: false,
    libStream: true
});


client.on('connect', () => {
  console.log('connected!');
});

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

async function fetchCurrentSchedule() {
  try {
    let schedule = [];
    const response = await axios.get(`${hyperionHost}/v1/chain/get_producer_schedule`);
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
async function fetchscheduleVersionold() {
  try {
    const response = await axios.get(`${hyperionHost}/v2/history/get_schedule`);

    const version = response.data.version;
    const producers = response.data.producers;
    const schedule = producers.map(producer => producer.name);
    const producersString = JSON.stringify(schedule);
    const hash = sha256(producersString);

    // return both version and schedule (which is producers list)
    console.log(version, schedule)
    // Save Producers to database and only add new ones, used to reference in missing block data
    return { version, schedule };
    
  } catch (error) {
    console.error('Error:', error);
    return {}; // return empty object in case of error
  }
}

async function fetchscheduleVersion() {
  try {
    const response = await axios.get(`${hyperionHost}/v1/chain/get_producer_schedule`);
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

    if(blockStateVersion === pendingScheduleVersion) {
      console.log('Match found')
      return {
        match: true,
        producerNames
      };
    } else {
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
//let scheduleProducersOld = []; // Start with empty list and after each sucessfull schedule change we reset the list to empty. 

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
          
          //if (blockHeaderState !== undefined) { // Check if blockHeaderState is not undefined
              console.log(`Block number: ${block_num_or_id}`);

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

client.setAsyncDataHandler(async (data) => {
  const block_num = data.content.block_num;
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
});


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

client.setAsyncLibDataHandler(async (data) => {
  let producer = data.content.producer;
  let block_num_lib = data.content.block_num;
  let timestamp = data.content['@timestamp'];

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
});


async function main() {
  await client.connect();
 

  /* The function replays from a certain point back in time to obtain the last fully producer round */

  // 1. Obtain the  timestamp of the last block saved in case we crashed.
  const now = new Date();
  let timestamp = now.toISOString();
  timestamp = timestamp.substring(0, timestamp.length - 5) + ".500Z";
  console.log(timestamp)
  const params = {
    start_from: timestamp 
  };
  
  // 2. Go back 90 seconds and forward 10 seconds to ensure we get a fully produced round.
  params.start_from = subtractTime(params.start_from, 90);
  params.read_until = AddTime(params.start_from, 10);
  
  // 3. Obtain the results for the last fully produced round
  const result = await fetchBlocks(params);
  //console.log(`Last producer to producer ${result.producer}`)
  //console.log(result.timestamp)
  console.log(`Last block: ${result.block}`)
  //const startBlocktimestamp = addMilliseconds(result.timestamp, 5);

  // 4. The last block from that fully produced round + 1 = the block where the next producer will start
  startBlock = result.block + 1

  // 5. Used for testing to only read_until a certain timestamp or block
  //const read_until = '2023-05-02T07:57:30.000Z'

  // 6. Find the index of the producer from the Fetcblock results
  let producerIndex = schedule.indexOf(result.producer);

  // 7. If the producer was found, move to the next producer. This producer is then passed as the first producer to client.streamActions
  if (producerIndex !== -1) {
    currentProducerIndex = (producerIndex + 1) % schedule.length;
    // Set the current schedule position 
    schedulePosition = currentProducerIndex + 1
    console.log(schedulePosition)
    currentProducer = schedule[currentProducerIndex];
  } else {
    console.error(`Producer ${result.producer} not found in the schedule`);
  }
 /* The function streams the blocks and counts missing rounds and or blocks. */
  // 8. Start streaming blocks and counting  missed rounds and blocks.
  client.streamActions({
    contract: 'eosio',
    action: 'onblock',
    account: '',
    start_from: startBlock,  
    filters: [],
  });


}
//updateScheduleWhenReady('222808285', '37652');
//fetchBlockHeaderState(222807456, 37651).then(result => console.log(result));
main();