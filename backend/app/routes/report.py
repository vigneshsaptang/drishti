"""Report export endpoint — generates JSON intelligence report with metadata."""
import json
import time
from datetime import datetime
from fastapi import APIRouter
from fastapi.responses import Response
from pydantic import BaseModel

router = APIRouter(tags=["report"])


class ReportRequest(BaseModel):
    search_results: dict


@router.post("/report/json")
def export_json(req: ReportRequest):
    """Export search results as a formatted JSON intelligence report."""
    data = req.search_results
    report = {
        "report_type": "SIGINT Intelligence Report",
        "generated_at": datetime.utcnow().isoformat() + "Z",
        "classification": "LAW ENFORCEMENT SENSITIVE",
        "seed": data.get("seed", {}),
        "summary": {
            "total_time_ms": data.get("total_time_ms"),
            "breach_sources_found": sum(
                len(r.get("sources", []))
                for r in data.get("breach", {}).get("results", [])
                if r.get("found")
            ),
            "entities_discovered": {
                "emails": data.get("discovered_entities", {}).get("emails", []),
                "phones": data.get("discovered_entities", {}).get("phones", []),
            },
            "telegram_mentions": data.get("threat_intel", {}).get("telegram", {}).get("total_mentions", 0),
            "darkweb_hits": len(data.get("darkweb", {}).get("entity_matches", {}).get("threads", [])),
            "watchlist_status": "MATCH" if (
                data.get("threat_intel", {}).get("crimedata_matches") or
                data.get("threat_intel", {}).get("worldcheck_matches")
            ) else "CLEAR",
        },
        "breach_intelligence": data.get("breach", {}),
        "threat_intelligence": data.get("threat_intel", {}),
        "darkweb_intelligence": data.get("darkweb", {}),
    }

    filename = f"SIGINT-{data.get('seed', {}).get('value', 'report')}-{datetime.utcnow().strftime('%Y%m%d')}.json"
    content = json.dumps(report, indent=2, default=str)
    return Response(
        content=content,
        media_type="application/json",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )
