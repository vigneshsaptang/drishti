"""Connection graph — builds nodes and edges from search results."""
from fastapi import APIRouter
from pydantic import BaseModel

router = APIRouter(tags=["graph"])


class GraphRequest(BaseModel):
    search_results: dict


@router.post("/graph/build")
def build_graph(req: GraphRequest):
    """Build a node-edge graph from search results for frontend visualization."""
    nodes = []
    edges = []
    seen_nodes: set[str] = set()

    def add_node(node_id: str, label: str, node_type: str, data: dict | None = None):
        if node_id not in seen_nodes:
            seen_nodes.add(node_id)
            nodes.append({"id": node_id, "label": label, "type": node_type, "data": data or {}})

    def add_edge(source: str, target: str, edge_type: str, data: dict | None = None):
        edges.append({"source": source, "target": target, "type": edge_type, "data": data or {}})

    sr = req.search_results

    # Build from breach results
    for r in sr.get("breach", {}).get("results", []):
        if not r.get("found"):
            continue
        entity_id = f"{r['entity_type']}:{r['entity_value']}"
        add_node(entity_id, r["entity_value"], r["entity_type"])

        for src in r.get("sources", []):
            breach_id = f"breach:{src['collection']}"
            add_node(breach_id, src.get("leak_name", src["collection"]), "breach",
                     {"breach_date": src.get("breach_date"), "description": src.get("description")})
            add_edge(entity_id, breach_id, "found_in")

            for rec in src.get("records", []):
                for email in rec.get("extracted_emails", []):
                    email_id = f"email:{email}"
                    add_node(email_id, email, "email")
                    add_edge(breach_id, email_id, "discovered_in")
                for phone in rec.get("extracted_phones", []):
                    phone_id = f"phone:{phone}"
                    add_node(phone_id, phone, "phone")
                    add_edge(breach_id, phone_id, "discovered_in")

    # Build from telegram
    tg = sr.get("threat_intel", {}).get("telegram", {})
    if tg.get("found"):
        seed_id = f"{sr['seed']['type']}:{sr['seed']['value']}"
        for gid in tg.get("group_ids", [])[:10]:
            group_id = f"telegram_group:{gid}"
            add_node(group_id, f"TG Group {gid}", "telegram_group")
            add_edge(seed_id, group_id, "mentioned_in")

    # Build from UPI
    for upi in sr.get("threat_intel", {}).get("upi_ids", []):
        upi_addr = upi.get("upi_details", {}).get("pa", "")
        if upi_addr:
            upi_id = f"upi:{upi_addr}"
            add_node(upi_id, upi_addr, "upi", {"classification": upi.get("clasification"), "site": upi.get("site")})
            seed_id = f"{sr['seed']['type']}:{sr['seed']['value']}"
            add_edge(seed_id, upi_id, "linked_upi")

    # Build from darkweb username matches
    for uh in sr.get("darkweb", {}).get("username_matches", []):
        uname = uh.get("username", "")
        if uname:
            dw_id = f"darkweb_account:{uname}"
            ap = uh.get("author_profile") or {}
            add_node(dw_id, uname, "darkweb_account", {"forum": ap.get("forum"), "posts": ap.get("total_posts")})

    return {"nodes": nodes, "edges": edges}
