import request from 'supertest';
import fastify from './server'; // import your server

beforeAll(async () => {
  await fastify.ready();
});

afterAll(() => {
  fastify.close();
});

const ownerName = 'sentnlagents';

describe('GET /missing-blocks', () => {
  it('should respond with 400 if startDate and endDate are not provided', async () => {
    const response = await request(fastify.server)
      .get('/missing-blocks')
      .query({ ownerName  });

    expect(response.status).toBe(400);
  });

  it('should respond with 200 and correct data if startDate and endDate are provided', async () => {
    const response = await request(fastify.server)
      .get('/missing-blocks')
      .query({ ownerName, startDate: '2022-01-01T00:00:00Z', endDate: '2022-01-02T00:00:00Z' });

    expect(response.status).toBe(200);
    expect(response.body).toHaveProperty('ownerName', ownerName);
    expect(response.body).toHaveProperty('startDate');
    expect(response.body).toHaveProperty('endDate');
    expect(response.body).toHaveProperty('data');
  });
  

  // Add more tests as needed
});

describe('GET /missing-blocks-by-days', () => {
  it('should respond with 400 if days is not provided', async () => {
    const response = await request(fastify.server)
      .get('/missing-blocks-by-days')
      .query({ ownerName });

    expect(response.status).toBe(400);
  });

  it('should respond with 200 and correct data if days is provided', async () => {
    const response = await request(fastify.server)
      .get('/missing-blocks-by-days')
      .query({ ownerName, days: 7 });

    expect(response.status).toBe(200);
    expect(response.body).toHaveProperty('ownerName', ownerName);
    expect(response.body).toHaveProperty('days');
    expect(response.body).toHaveProperty('data');
  });
  // Add more tests as needed
});

describe('GET /empty-blocks-by-days', () => {
  it('should respond with 400 if days is not provided', async () => {
    const response = await request(fastify.server)
      .get('/empty-blocks-by-days')
      .query({ ownerName });

    expect(response.status).toBe(400);
  });

  it('should respond with 200 and correct data if days is provided', async () => {
    const response = await request(fastify.server)
      .get('/empty-blocks-by-days')
      .query({ ownerName, days: 7 });

    expect(response.status).toBe(200);
    expect(response.body).toHaveProperty('ownerName', ownerName);
    expect(response.body).toHaveProperty('days');
    expect(response.body).toHaveProperty('data');
  });

  // Add more tests as needed
});