var dotenv = require('dotenv');

dotenv.config({
    path: `.env.${process.env.NODE_ENV}`
});

module.exports = {
    "type": "mysql",
    "host": process.env.DB_HOST,
    "port": process.env.DB_PORT,
    "username": process.env.DB_USERNAME,
    "password": process.env.DB_PASSWORD,
    "database": process.env.DB_DATABASENAME,
    "entities": [
        process.env.ENTITY_PATH
    ],
    "migrations": [
        process.env.MIGRATION_PATH
    ],
    "synchronize": true,
    "cache": true,
    "cli": {
        "migrationsDir": "./src/migration"
    },
    "logging": [
        "error",
        "query"
    ]
}
