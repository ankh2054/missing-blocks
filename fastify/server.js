import fastifyOrig from 'fastify';
const fastify = fastifyOrig({ logger: true });
import swagger from '@fastify/swagger';
import fastifySwaggerUi from '@fastify/swagger-ui';
import dotenv from 'dotenv';
import { getMissingBlockData, getMissingBlockDataByDays,getEmptyBlockData,getEmptyBlockDataByDays,getScheduleChangesForDays,getOwnerIDByName,getLatestMonitoringData } from './pgquery.js';


// Helper function to calculate total missed blocks
function calculateTotalMissedBlocks(data) {
  return data.reduce((acc, cur) => acc + cur.missed_block_count, 0);
}

// Helper function to calculate percentages
function calculatePercentages(totalMissedBlocks, totalExpectedBlocks) {
  const percentageMissed = ((totalMissedBlocks / totalExpectedBlocks) * 100).toFixed(3);
  const percentageReliability = (100 - parseFloat(percentageMissed)).toFixed(3);
  return { percentageMissed, percentageReliability };
}

async function calculateTotalExpectedBlocks(days, scheduleChanges, ownerName) {
  if (!scheduleChanges || !scheduleChanges.length) {
    return days * 8184; 
  }

  // Sort scheduleChanges by date
  scheduleChanges.sort((a, b) => new Date(a.date) - new Date(b.date));

  let totalExpectedBlocks = days * 8184; 
  let lastScheduleChangeBlock = scheduleChanges[0].block_number;

  for (let i = 1; i < scheduleChanges.length; i++) {
    const change = scheduleChanges[i];
    
    if (!change) continue;

    // Calculate blocks not in schedule for based on the block difference
    const blocksNotinSchedule = change.block_number - lastScheduleChangeBlock;
    // Calculates the amount of block produced roughly, by each producer for that amount of blocks. TAke amount of blocks / 12
    const blocksPerProducer = Math.round(blocksNotinSchedule / change.schedule_producers.length); 
    //console.log( `Schedule producers length: ${change.schedule_producers.length}`)
    //console.log(`blocksMissedPerProducer ${blocksPerProducer}`)

    //console.log(`Processing change at block: ${change.block_number}`);
    //console.log(`Blocks missed since last change: ${blocksNotinSchedule}`);


    // If the owner was part of this schedule
    if (change.schedule_producers.includes(ownerName)) {
      const ownerPosition = change.schedule_producers.indexOf(ownerName) + 1; 
      //console.log(`Owner pos: ${ownerPosition}`)
      //console.log(`schedule_position: ${change.schedule_position}`)
      if (ownerPosition <= change.schedule_position  ) {
        totalExpectedBlocks -= 12;
        console.log(`Deducting 12 blocks as schedule changed after owner's position.`);
      }
    } else {
      totalExpectedBlocks -= blocksPerProducer;
      //console.log(`Deducting ${blocksPerProducer} blocks as owner was not in schedule.`);
    }
    
    lastScheduleChangeBlock = change.block_number;
  }

  console.log(`Total expected blocks: ${totalExpectedBlocks}`);
  return totalExpectedBlocks;
}



// Look at schedules then the first schedule yuo se where i am not part of it, take the schedule position Or block number ( think about it)
// Then look fort the next schedule where I am part of it, and then check based on the schedule position and where I am in the schedule where I produced that round, if so you can work out how many 
// blocks I did not produce IF the schedule changed after my position, count from the next round only.
// You can also use the block numbers to help with the counting.


await fastify.register(swagger, {
    routePrefix: '/documentation',
    swagger: {
      info: {
        title: 'Missing Blocks Data for WAX chains',
        description: '❤️ Made for WAX by Sentnl & OIAC',
        version: '1.0.0'
      },
      host: process.env.HOST,
      schemes: ['https'],
      consumes: ['application/json'],
      produces: ['application/json'],
      tags: [
        { name: 'Missing Blocks', description: 'Missing Blocks related end-points' },
        { name: 'Empty Blocks', description: 'Empty Blocks related end-points' }
      ],
      definitions: {
        MissingBlocksData: {
          type: 'object',
          properties: {
            ownerName: { type: 'string' },
            startDate: { type: 'string', format: 'date-time' },
            endDate: { type: 'string', format: 'date-time' },
            totalExpectedBlocks: { type: 'integer' },
            totalMissedBlocks: { type: 'integer' },
            percentageMissed: { type: 'number', format: 'float' },
            percentageReliability: { type: 'number', format: 'float' },
            data: { 
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  owner_name: { type: 'string' },
                  block_number: { type: 'integer' },
                  date: { type: 'string', format: 'date-time' },
                  round_missed: { type: 'boolean' },
                  blocks_missed: { type: 'boolean' },
                  missed_block_count: { type: 'integer' },
                },
              },
            },
          }
        },
        EmptyBlocksData: {
          type: 'object',
          properties: {
            ownerName: { type: 'string' },
            startDate: { type: 'string', format: 'date-time' },
            endDate: { type: 'string', format: 'date-time' },
            data: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  owner_name: { type: 'string' },
                  total_empty: { type: 'integer' },
                  empty_blocks: {
                    type: 'array',
                    items: {
                      type: 'object',
                      properties: {
                        block_number: { type: 'integer' },
                        date: { type: 'string', format: 'date-time' },
                        empty_block: { type: 'boolean' }
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
    }
  });
  
await fastify.register(fastifySwaggerUi, {
    routePrefix: '/documentation',
    uiConfig: {
      docExpansion: 'full',
      deepLinking: false
    },
    uiHooks: {
      onRequest: function (request, reply, next) { next() },
      preHandler: function (request, reply, next) { next() }
    },
    staticCSP: true,
    transformStaticCSP: (header) => header,
    transformSpecification: (swaggerObject, request, reply) => { return swaggerObject },
    transformSpecificationClone: true
  })
  


dotenv.config();

  fastify.get('/missing-blocks', {
    schema: {
      description: 'Get missing blocks data',
      tags: ['Missing Blocks'],
      summary: 'Get missing blocks data for a producer and a date range',
      querystring: {
        type: 'object',
        properties: {
          ownerName: { type: 'string', description: 'Owner name (optional)' },
          startDate: { type: 'string', format: 'date-time' },
          endDate: { type: 'string', format: 'date-time' },
        },
        required: ['startDate', 'endDate'],
      },
      response: {
        200: {
          description: 'Successful response',
          type: 'object',
          properties: {
            ownerName: { type: 'string' },
            startDate: { type: 'string', format: 'date-time' },
            endDate: { type: 'string', format: 'date-time' },
            totalExpectedBlocks: { type: 'integer' },
            totalMissedBlocks: { type: 'integer' },
            percentageMissed: { type: 'number', format: 'float' },
            percentageReliability: { type: 'number', format: 'float' },
            data: { 
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  owner_name: { type: 'string' },
                  block_number: { type: 'integer' },
                  date: { type: 'string', format: 'date-time' },
                  round_missed: { type: 'boolean' },
                  blocks_missed: { type: 'boolean' },
                  missed_block_count: { type: 'integer' }, // added missed_block_count
                },
              },
            },
          },
        },
      },
    },
    handler: async (request, reply) => {
      const { ownerName, startDate, endDate } = request.query;
  
      if (!startDate || !endDate) {
        return reply.status(400).send({
          error: 'Please provide both startDate and endDate query parameters.',
        });
      }
      let ownerID;
      if (ownerName) {
        try {
          const ownerID = await getOwnerIDByName(ownerName);
          if (!ownerID) {
            return reply.status(404).send({
              error: `The owner name ${ownerName} does not exist in the database.`,
            });
          }
        } catch (err) {
          console.error(err); // Log the error
          return reply.status(500).send({
            error: 'An error occurred while fetching the owner ID.',
          });
        }
      }
      const data = await getMissingBlockData(ownerName, startDate, endDate);
      if (!ownerName) {
        return { 
            ownerName, 
            startDate, 
            endDate,
            data
        };
      }
  
      try {
        const totalMissedBlocks = calculateTotalMissedBlocks(data);
        const days = (new Date(endDate) - new Date(startDate)) / (1000 * 60 * 60 * 24); // calculate days
        const scheduleChanges = await getScheduleChangesForDays(ownerName, days);
        const totalExpectedBlocks = await calculateTotalExpectedBlocks(days, scheduleChanges, ownerID);
        const { percentageMissed, percentageReliability } = calculatePercentages(totalMissedBlocks, totalExpectedBlocks);
  
        return { 
          ownerName, 
          startDate, 
          endDate, 
          totalExpectedBlocks,
          totalMissedBlocks,
          percentageMissed,
          percentageReliability,
          data 
        };
      } catch (err) {
        console.error(err);
        reply.status(500).send({
          error: 'An error occurred while fetching the missing block data.',
        });
      }
    },
  });
  
  fastify.get('/missing-blocks-by-days', {
    schema: {
      description: 'Get missing blocks data by number of days',
      tags: ['Missing Blocks'],
      summary: 'Get missing blocks data for a producer and a number of days',
      querystring: {
        type: 'object',
        properties: {
          ownerName: { type: 'string', description: 'Owner name (optional)' },
          days: { type: 'integer' },
        },
        required: ['days'],
      },
      response: {
        200: {
          description: 'Successful response',
          type: 'object',
          properties: {
            ownerName: { type: 'string' },
            days: { type: 'integer' },
            totalExpectedBlocks: { type: 'integer' },
            totalMissedBlocks: { type: 'integer' },
            percentageMissed: { type: 'number', format: 'float' },  // added percentageMissed
            percentageReliability: { type: 'number', format: 'float' },
            data: { 
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  owner_name: { type: 'string' },
                  block_number: { type: 'integer' },
                  date: { type: 'string', format: 'date-time' },
                  round_missed: { type: 'boolean' },
                  blocks_missed: { type: 'boolean' },
                  missed_block_count: { type: 'integer' }, // added missed_block_count
                },
              },
            }
          },
        },
      },
    },
    handler: async (request, reply) => {
        const { ownerName, days } = request.query;
        let ownerID;
    
        if (!days) {
          return reply.status(400).send({
            error: 'Please provide the days query parameter.',
          });
        }

        if (ownerName) {
          try {
            const ownerID = await getOwnerIDByName(ownerName);
            if (!ownerID) {
              return reply.status(404).send({
                error: `The owner name ${ownerName} does not exist in the database.`,
              });
            }
          } catch (err) {
            console.error(err);
            return reply.status(500).send({
              error: 'An error occurred while fetching the owner ID.',
            });
          }
        }

        const data = await getMissingBlockDataByDays(ownerName, days);

        if (!ownerName) {
          // If ownerName is not specified, return only this data
          return { 
              ownerName, 
              days, 
              data
          };
        }

        const totalMissedBlocks = calculateTotalMissedBlocks(data);
        const scheduleChanges = await getScheduleChangesForDays(ownerName, days);
        const totalExpectedBlocks = await calculateTotalExpectedBlocks(days, scheduleChanges, ownerID);
        const { percentageMissed, percentageReliability } = calculatePercentages(totalMissedBlocks, totalExpectedBlocks);
    
        return { 
          ownerName, 
          days, 
          totalExpectedBlocks,
          totalMissedBlocks,
          percentageMissed,
          percentageReliability,
          data
        };
      },
    });
  


// Empty Block Data
fastify.get('/empty-blocks', {
  schema: {
    description: 'Get empty blocks data',
    tags: ['Empty Blocks'],
    summary: 'Get empty blocks data for a producer and a date range',
    querystring: {
      type: 'object',
      properties: {
        ownerName: { type: 'string', description: 'Owner name (optional)' },
        startDate: { type: 'string', format: 'date-time' },
        endDate: { type: 'string', format: 'date-time' },
      },
      required: ['startDate', 'endDate'],
    },
    response: {
      200: {
        description: 'Successful response',
        type: 'object',
        properties: {
          ownerName: { type: 'string' },
          startDate: { type: 'string', format: 'date-time' },
          endDate: { type: 'string', format: 'date-time' },
          data: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                owner_name: { type: 'string' },
                total_empty: { type: 'integer' }, // Add this line
                empty_blocks: {
                  type: 'array',
                  items: {
                    type: 'object',
                    properties: {
                      block_number: { type: 'integer' },
                      date: { type: 'string', format: 'date-time' },
                      empty_block: { type: 'boolean' }
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
  },
  handler: async (request, reply) => {
    const { ownerName, startDate, endDate } = request.query;

    if (!startDate || !endDate) {
      return reply.status(400).send({
        error: 'Please provide both startDate and endDate query parameters.',
      });
    }

    if (ownerName) {
      try {
        const ownerID = await getOwnerIDByName(ownerName);
        if (!ownerID) {
          return reply.status(404).send({
            error: `The owner name ${ownerName} does not exist in the database.`,
          });
        }
      } catch (err) {
        console.error(err);
        return reply.status(500).send({
          error: 'An error occurred while fetching the owner ID.',
        });
      }
    }
    try {
      const rawData = await getEmptyBlockData(ownerName, startDate, endDate);
      console.log(rawData)
      const data = rawData.map(item => {
        const emptyBlocks = item.block_numbers.map((block_number, index) => {
          return {
            block_number,
            date: item.dates[index],
            empty_block: true
          };
        });
        return {
          owner_name: item.owner_name,
          total_empty: Number(item.total_empty_blocks), // convert to number
          empty_blocks: emptyBlocks
        };
      });
      return { ownerName, startDate, endDate, data };
    } catch (err) {
      console.error(err);
      return reply.status(500).send({
        error: 'An error occurred while fetching the empty block data.',
      });
    }
  },
});

fastify.get('/empty-blocks-by-days', {
  schema: {
      description: 'Get empty blocks data by number of days',
      tags: ['Empty Blocks'],
      summary: 'Get empty blocks data for a producer and a number of days',
      querystring: {
          type: 'object',
          properties: {
              ownerName: { type: 'string', description: 'Owner name (optional)' },
              days: { type: 'integer' },
          },
          required: ['days'],
      },
      response: {
        200: {
          description: 'Successful response',
          type: 'object',
          properties: {
            ownerName: { type: 'string' },
            days: { type: 'integer' },
            data: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  owner_name: { type: 'string' },
                  total_empty: { type: 'integer' }, // Add this line
                  empty_blocks: {
                    type: 'array',
                    items: {
                      type: 'object',
                      properties: {
                        block_number: { type: 'integer' },
                        date: { type: 'string', format: 'date-time' },
                        empty_block: { type: 'boolean' }
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
  handler: async (request, reply) => {
    const { ownerName, days } = request.query;

    if (!days) {
      return reply.status(400).send({
        error: 'Please provide the days query parameter.',
      });
    }

    if (ownerName) {
      try {
        const ownerID = await getOwnerIDByName(ownerName);
        if (!ownerID) {
          return reply.status(404).send({
            error: `The owner name ${ownerName} does not exist in the database.`,
          });
        }
      } catch (err) {
        console.error(err);
        return reply.status(500).send({
          error: 'An error occurred while fetching the owner ID.',
        });
      }
    }
    try {
      const rawData = await getEmptyBlockDataByDays(ownerName, days);
      const data = rawData.map(item => {
        const emptyBlocks = item.block_numbers.map((block_number, index) => {
          return {
            block_number,
            date: item.dates[index],
            empty_block: true
          };
        });
        return {
          owner_name: item.owner_name,
          total_empty: Number(item.total_empty_blocks), // convert to number
          empty_blocks: emptyBlocks
        };
      });
      return { ownerName, days, data };
    } catch (err) {
      console.error(err);
      return reply.status(500).send({
        error: 'An error occurred while fetching the empty block data.',
      });
    }
  },
});


fastify.get('/monitoring', {
  schema: {
    hide: true,
    description: 'Get latest monitoring data',
    tags: ['Monitoring'],
    summary: 'Get the block number and timestamp of the latest row in the monitoring table',
    response: {
      200: {
        description: 'Successful response',
        type: 'object',
        properties: {
          owner_name: { type: 'string' },
          block_number: { type: 'integer' },
          date: { type: 'string', format: 'date-time' },
          first_in_schedule: { type: 'boolean' },
        },
      },
    },
  },
  handler: async (request, reply) => {
    try {
      const data = await getLatestMonitoringData();
      // Convert the date to a string in UTC timezone
      //data.date = new Date(data.date).toISOString();
      return data;
    } catch (err) {
      console.error(err);
      return reply.status(500).send({
        error: 'An error occurred while fetching the latest monitoring data.',
      });
    }
  },
});

// Start the server
const start = async () => {
    try {
      await fastify.ready();  // make sure to call this before listening
      await fastify.listen({ port: 8001, host: '0.0.0.0' });
      fastify.log.info(`Server listening on ${fastify.server.address().port}`);
    } catch (err) {
      fastify.log.error(err);
      process.exit(1);
    }
  };
  
  start();