import readline from 'readline';
import fs from 'fs';


 
let pendingScheduleVersion //= 629; 
let scheduleChangedatBlock = 228785592 
let startBlock = 228785603
let producerBlocks = {};
let schedulePosition = 1;
let scheduleProducers = [];
let oldSchedule = [];
let scheduleChangedInThisRound = false;
let scheduleChangePosition = 0;
let schedule = [ 'bp.alcor','liquidgaming',
'wax.eastern',  'bp.box',
'eosiodetroit', 'wizardsguild',
'oneinacilian', 'cryptolions1',
'dapplicawaxt', '3dkrenderwax',
'waxswedenorg', 'blokcrafters',
'eosarabianet', 'greeneosiobp',
'tokengamerio', 'ledgerwiseio',
'eosdublinwow', 'waxmadrid111',
'wecan',        'sentnlagents',
'waxdaoguild1']
let newschedule = [ 'bp.alcor','liquidgaming',
'wax.eastern',  'bp.box',
'eosiodetroit', 'wizardsguild',
'oneinacilian', 'cryptolions1',
'dapplicawaxt', '3dkrenderwax',
'waxswedenorg', 'blokcrafters',
'eosarabianet', 'greeneosiobp',
'tokengamerio', 'ledgerwiseio',
'eosdublinwow', 'waxmadrid111',
'wecan',        'sentnlagents',
'waxdaoguild1']

function findMissedBlock(blocks) {
  console.log(blocks);
  if (blocks.length > 0) {
    let { timestamp, blockNum } = blocks[0];
    return { timestamp, blockNum };
  }
  
  return null;
}


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


let rl = readline.createInterface({
  input: fs.createReadStream('streamingtest.log'),
});

rl.on('line', function (line) {
  handleData(line);
});

function handleData(line) {
  let producerRegex = /signed by ([\w.]+)/;
  let blockNumRegex = /#\d+/;
  let timestampRegex = /@\s+\d+-\d+-\d+T\d+:\d+:\d+/;

  let producerMatch = line.match(producerRegex);
  let blockNumMatch = line.match(blockNumRegex);
  let timestampMatch = line.match(timestampRegex);

  if (producerMatch && blockNumMatch && timestampMatch) {
    let producer = producerMatch[1];
    let block_num_lib = parseInt(blockNumMatch[0].slice(1), 10);
    let timestamp = new Date(timestampMatch[0].slice(2));

    console.log(`Producer: ${producer}, Block Number: ${block_num_lib}, Timestamp: ${timestamp}`);

    // Schedule changed at block
  if (block_num_lib === scheduleChangedatBlock) {
    console.log(`The current block number is ${block_num_lib} and the schedule changed at block: ${scheduleChangedatBlock}`);
    console.log(`Schedule is being updated to version ${pendingScheduleVersion}`);
    console.log(`New producer schedule is: ${newschedule}`);
    console.log(`Old producer schedule is: ${schedule}`);

    oldSchedule = schedule; // assign current schedule as oldschedule for later reference
    schedule = newschedule; // assign newschedule to schedule
    scheduleChangedInThisRound = true;
    console.log(`schedule ${schedule}`)
    scheduleChangePosition = oldSchedule.indexOf(producer);  //At what producer position did the schedule change in oldschedule.
    console.log(`scheduleChangePosition ${scheduleChangePosition}`)
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
  console.log(`Start Block for round ${startBlock}`)
  console.log(`End block for round ${endBlock}`);
  console.log(`Current schedule position is ${schedulePosition}`);
  console.log(`Current blocks for this round ${blocksPerRound}`);
  console.log(`Current block number: ${block_num_lib}`);
  console.log(`Current Producer: ${producer}`);
  console.log(`Timestamp: ${timestamp}`);

  // If the current block number is equal to endBlock, calculate each producer's block count
  if (block_num_lib === endBlock) {
    console.log(producerBlocks)
    // If the schedule changed during this round, then combine old and new schedule accordingly.
    if ( scheduleChangedInThisRound ){
      scheduleProducers = combineSchedules(oldSchedule, schedule, scheduleChangePosition);
    }
    console.log(`Producer Schedule ${scheduleProducers}`)
    for (let p of scheduleProducers) {
    console.log(`Current Producer ${p}`)
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
              timestamp = new Date(timestamp);
              timestamp.setSeconds(timestamp.getSeconds() - scheduleProducers.length * 12 * 0.5 + producerIndex * 12 * 0.5);
            }
          }
          // If the producer is the first one in the schedule, use the previous calculation
          else {
            blockNum = endBlock - scheduleProducers.length * 12 + producerIndex * 12 + 1;
            timestamp = new Date(timestamp);
            timestamp.setSeconds(timestamp.getSeconds() - scheduleProducers.length * 12 * 0.5 + producerIndex * 12 * 0.5);
          }
        let missingBlocksCount = 12;
        console.log(`Producer ${p} missed a round at ${timestamp}, ${blockNum}`)

      // Count missing blocks
      } else if (producerBlocks[p].length < 12) {
        console.log(`${p} produced ${producerBlocks[p].length}`)
        let missingBlocksCount = 12 - producerBlocks[p].length;
        let missedBlock = findMissedBlock(producerBlocks[p]);
        console.log(missedBlock)
        if (missedBlock) {
            console.log(`Producer ${p} missed ${missingBlocksCount} block(s) at ${missedBlock.timestamp}, ${missedBlock.blockNum}`)
        }
      }
  }
    // Reset Schedule Change parameters for the next time.
      if (scheduleChangedInThisRound) {
        oldSchedule = null;
        scheduleChangedInThisRound = false;
        //scheduleProducersOld = [];
      }

      console.log("The current round has ended:", schedule);
}
  }

}