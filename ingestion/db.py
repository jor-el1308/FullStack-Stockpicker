"""
Owner: Person 2 (Charles) - Data Collection & Database Design.

Thin MySQL connection helper for the ingestion pipeline. Uses the same
`stockpicker` schema defined in server/src/db/schema.sql - make sure
you've run `npm run db:migrate --workspace=server` before running ingest.py.
"""
import pymysql
import pymysql.cursors

import config


def get_connection():
    return pymysql.connect(
        host=config.DB_HOST,
        port=config.DB_PORT,
        user=config.DB_USER,
        password=config.DB_PASSWORD,
        database=config.DB_NAME,
        charset="utf8mb4",
        cursorclass=pymysql.cursors.Cursor,
        autocommit=False,
    )
