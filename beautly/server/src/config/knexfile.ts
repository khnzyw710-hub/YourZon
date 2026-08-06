import type { Knex } from 'knex';
import dotenv from 'dotenv';

dotenv.config({ path: '../.env' });

const config: { [key: string]: Knex.Config } = {
  development: {
    client: 'pg',
    connection: process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/beautly',
    pool: { min: 2, max: 10 },
    migrations: {
      directory: '../migrations',
      extension: 'ts',
    },
    seeds: {
      directory: '../seeds',
    },
  },
};

export default config;
module.exports = config;
