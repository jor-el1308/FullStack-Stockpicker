"""
Owner: Person 2 (Charles) - Data Collection & Database Design.

Thin MySQL connection helper for the ingestion pipeline. Uses the same
`stockpicker` schema defined in server/src/db/schema.sql - make sure
you've run `npm run db:migrate --workspace=server` before running ingest.py.
"""
import ssl as ssl_lib

import pymysql
import pymysql.cursors

import config


def _build_ssl_context():
    """Mirrors server/src/config/dbEnv.js: verify against the given CA if
    one is provided, otherwise still encrypt but don't verify (works for
    managed hosts like Aiven without needing the exact right cert chain)."""
    if config.DB_SSL_CA:
        return ssl_lib.create_default_context(cafile=config.DB_SSL_CA)
    ctx = ssl_lib.create_default_context()
    ctx.check_hostname = False
    ctx.verify_mode = ssl_lib.CERT_NONE
    return ctx


def get_connection():
    kwargs = dict(
        host=config.DB_HOST,
        port=config.DB_PORT,
        user=config.DB_USER,
        password=config.DB_PASSWORD,
        database=config.DB_NAME,
        charset="utf8mb4",
        cursorclass=pymysql.cursors.Cursor,
        autocommit=False,
    )
    if config.DB_SSL:
        kwargs["ssl"] = _build_ssl_context()
    return pymysql.connect(**kwargs)
