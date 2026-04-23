"""Tor proxy endpoint — fetches onion pages through the Tor SOCKS5 proxy."""
import httpx
from fastapi import APIRouter, Query
from fastapi.responses import Response
from app.config import settings

router = APIRouter(tags=["tor"])

TOR_PROXY = f"socks5://127.0.0.1:{settings.tor_socks_port}"


@router.get("/tor/fetch")
async def fetch_onion(url: str = Query(...)):
    """Fetch a .onion URL through the Tor proxy and return the content."""
    if not url.endswith('.onion') and '.onion/' not in url:
        return {"error": "Only .onion URLs are allowed"}

    try:
        async with httpx.AsyncClient(
            proxy=TOR_PROXY,
            timeout=30.0,
            follow_redirects=True,
            verify=False,
        ) as client:
            resp = await client.get(url)
            content_type = resp.headers.get('content-type', 'text/html')

            if 'image' in content_type:
                return Response(content=resp.content, media_type=content_type)

            return {
                "url": url,
                "status": resp.status_code,
                "content_type": content_type,
                "html": resp.text[:50000],  # Cap at 50KB
            }
    except Exception as e:
        return {"error": str(e), "url": url, "note": "Tor proxy may not be running. Start with: docker compose up tor"}
