"""
Database connections — singleton clients shared across the app.
"""
from pymongo import MongoClient
from app.config import settings

_clients: dict[str, MongoClient] = {}


def _connect(name: str, uri: str) -> MongoClient:
    if name not in _clients:
        _clients[name] = MongoClient(
            uri,
            connectTimeoutMS=20_000,
            socketTimeoutMS=settings.credmon_socket_timeout_ms,
            serverSelectionTimeoutMS=20_000,
            maxPoolSize=10,
        )
    return _clients[name]


def get_credmon() -> MongoClient:
    return _connect("credmon", settings.mongo_uri_credmon)


def get_darkmon() -> MongoClient:
    return _connect("darkmon", settings.mongo_uri_darkmon)


def get_fti() -> MongoClient:
    return _connect("fti", settings.mongo_uri_fti)


def close_all():
    for c in _clients.values():
        c.close()
    _clients.clear()
