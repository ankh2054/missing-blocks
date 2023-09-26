import dotenv from 'dotenv';
dotenv.config();

export const port = process.env.PORT;
export const pguser = process.env.PGUSER;
export const pgport = process.env.PGPORT;
export const pgpassword = process.env.DB_PASSWORD;
export const pgdb = process.env.PGDB;
export const pghost = process.env.PGHOST;
