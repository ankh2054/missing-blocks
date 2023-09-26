import dotenv from 'dotenv';
dotenv.config();

export const port = process.env.PORT;
export const pguser = process.env.PGUSER;
export const pgport = process.env.PGPORT;
export const pgpassword = process.env.DB_PASSWORD;
export const pgdb = process.env.PGDB;
export const pghost = process.env.PGHOST;
export const shipHost = process.env.SHIPHOST;
export const hyperionHost = process.env.HYPERIONHOST;
export const streamingHost = process.env.STREAMINGHOST;
export const recordEmptyBlocks = process.env.RECORDEMPTYBLOCKS === 'true';
