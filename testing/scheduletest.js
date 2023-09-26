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

let newSchedule = ['bp.alcor', 'liquidgaming', 'wax.eastern', 'bp.box', 'eosiodetroit', 'wizardsguild', 'oneinacilian', 'amsterdamwax', 'guild.nefty', 'dapplicawaxt', 'guild.taco', '3dkrenderwax', 'blokcrafters', 'eosarabianet', 'greeneosiobp', 'tokengamerio', 'ledgerwiseio', 'waxmadrid111', 'wecan', 'sentnlagents', 'waxdaoguild1']

let oldSchedule = ['bp.alcor', 'liquidgaming', 'wax.eastern', 'bp.box', 'eosphereiobp', 'eosiodetroit', 'wizardsguild', 'oneinacilian', 'amsterdamwax', 'guild.nefty', 'dapplicawaxt', 'guild.taco', '3dkrenderwax', 'blokcrafters', 'eosarabianet', 'greeneosiobp', 'tokengamerio', 'ledgerwiseio', 'waxmadrid111', 'wecan', 'waxdaoguild1']


let scheduleChangePosition = 20;

let combinedSchedule = combineSchedules(oldSchedule, newSchedule, scheduleChangePosition);

console.log(combinedSchedule);
