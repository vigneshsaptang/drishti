"""Custom JSON serialization for MongoDB types."""
import json
from datetime import datetime
from bson import ObjectId
from fastapi.responses import JSONResponse


class MongoJSONEncoder(json.JSONEncoder):
    def default(self, obj):
        if isinstance(obj, ObjectId):
            return str(obj)
        if isinstance(obj, datetime):
            return obj.isoformat()
        if isinstance(obj, bytes):
            return obj.decode('utf-8', errors='replace')
        if isinstance(obj, set):
            return list(obj)
        return super().default(obj)


class MongoJSONResponse(JSONResponse):
    def render(self, content):
        return json.dumps(content, cls=MongoJSONEncoder, ensure_ascii=False).encode('utf-8')
