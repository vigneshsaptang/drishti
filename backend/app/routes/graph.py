"""Connection graph — builds nodes and edges from search results.

Each node carries an ``origin`` dict that lets the UI explain *why* a node is
on the graph:

    {
      "capability":     "breach" | "darkweb" | "watchlist" | "court" |
                         "financial" | "seed",
      "via_seed":       "<seed value>",
      "via_seed_type":  "phone" | "email" | "username" | "fullname",
      "depth":          int,
      "evidence_count": int,            # distinct records mentioning this node
      "datasets":       ["...", ...]    # top 3 source collection / dataset names
    }

The capability codes are snake_case-only and intentionally decoupled from
internal engine module names (CREDMON / DARKMON / FTI / KAMAL / ecourts_cache).
The frontend ``<Provenance>`` component owns the code → user-facing label
mapping; this module must never emit those internal names into the JSON
payload values.
"""
from collections import Counter
from fastapi import APIRouter
from pydantic import BaseModel

router = APIRouter(tags=["graph"])


# Capability codes — snake_case, frontend-stable. Keep this list in sync with
# PROVENANCE_BRANDING.md. Do NOT add internal engine names here.
_CAPABILITIES = {"seed", "breach", "darkweb", "watchlist", "court", "financial"}


class GraphRequest(BaseModel):
    search_results: dict


def _seed_tuple(sr: dict) -> tuple[str, str]:
    """Return (seed_type, seed_value) from a search-results payload."""
    seed = sr.get("seed") or {}
    return (str(seed.get("type") or ""), str(seed.get("value") or ""))


@router.post("/graph/build")
def build_graph(req: GraphRequest):
    """Build a node-edge graph from search results for frontend visualization."""
    nodes: list[dict] = []
    edges: list[dict] = []
    seen_nodes: set[str] = set()
    node_index: dict[str, dict] = {}

    # Per-node provenance accumulators (updated as we discover the same value
    # from multiple sources). We compute evidence_count + datasets at the end.
    evidence_counter: dict[str, int] = {}
    dataset_counter: dict[str, Counter] = {}

    sr = req.search_results
    seed_type, seed_value = _seed_tuple(sr)
    seed_id = f"{seed_type}:{seed_value}" if seed_value else ""

    def _add_node(
        node_id: str,
        label: str,
        node_type: str,
        *,
        capability: str,
        via_seed: str = "",
        via_seed_type: str = "",
        depth: int = 0,
        data: dict | None = None,
    ) -> dict:
        if capability not in _CAPABILITIES:
            capability = "seed" if node_id == seed_id else "breach"
        if node_id not in seen_nodes:
            seen_nodes.add(node_id)
            node = {
                "id": node_id,
                "label": label,
                "type": node_type,
                "data": data or {},
                "origin": {
                    "capability": capability,
                    "via_seed": via_seed or seed_value,
                    "via_seed_type": via_seed_type or seed_type,
                    "depth": depth,
                    "evidence_count": 0,
                    "datasets": [],
                },
            }
            nodes.append(node)
            node_index[node_id] = node
            evidence_counter[node_id] = 0
            dataset_counter[node_id] = Counter()
        else:
            # Keep the smallest depth and prefer non-default capability when
            # the same value appears via multiple paths.
            existing = node_index[node_id]["origin"]
            if depth and (existing["depth"] == 0 or depth < existing["depth"]):
                existing["depth"] = depth
            if existing["capability"] not in _CAPABILITIES or (
                existing["capability"] == "breach"
                and capability in {"watchlist", "darkweb", "court", "financial"}
            ):
                existing["capability"] = capability
            if not existing["via_seed"] and via_seed:
                existing["via_seed"] = via_seed
            if not existing["via_seed_type"] and via_seed_type:
                existing["via_seed_type"] = via_seed_type
        return node_index[node_id]

    def _bump_evidence(node_id: str, dataset: str | None = None, count: int = 1):
        if node_id not in node_index:
            return
        evidence_counter[node_id] = evidence_counter.get(node_id, 0) + count
        if dataset:
            dataset_counter[node_id][dataset] += count

    def _add_edge(
        source: str,
        target: str,
        edge_type: str,
        *,
        label: str | None = None,
        capability: str | None = None,
        data: dict | None = None,
    ):
        edge: dict = {
            "source": source,
            "target": target,
            "type": edge_type,
            "data": data or {},
        }
        if label:
            edge["label"] = label
        if capability and capability in _CAPABILITIES:
            edge["capability"] = capability
        edges.append(edge)

    # ── Seed node ────────────────────────────────────────────────────────
    if seed_id:
        _add_node(
            seed_id,
            seed_value,
            seed_type or "seed",
            capability="seed",
            via_seed=seed_value,
            via_seed_type=seed_type,
            depth=0,
        )

    # ── Breach-derived nodes (capability: breach) ───────────────────────
    for r in sr.get("breach", {}).get("results", []):
        if not r.get("found"):
            continue
        depth = int(r.get("depth", 0) or 0)
        entity_id = f"{r['entity_type']}:{r['entity_value']}"
        is_seed_entity = (entity_id == seed_id)
        _add_node(
            entity_id,
            r["entity_value"],
            r["entity_type"],
            capability="seed" if is_seed_entity else "breach",
            via_seed=seed_value,
            via_seed_type=seed_type,
            depth=0 if is_seed_entity else depth,
        )

        for src in r.get("sources", []):
            collection = src.get("collection", "")
            leak_name = src.get("leak_name") or collection or "breach"
            breach_id = f"breach:{collection}"
            _add_node(
                breach_id,
                leak_name,
                "breach",
                capability="breach",
                via_seed=seed_value,
                via_seed_type=seed_type,
                depth=max(1, depth),
                data={
                    "breach_date": src.get("breach_date"),
                    "description": src.get("description"),
                },
            )
            record_count = int(src.get("record_count_found", 0) or 0) or len(src.get("records", []))
            _bump_evidence(entity_id, dataset=leak_name, count=max(1, record_count))
            _bump_evidence(breach_id, dataset=leak_name, count=max(1, record_count))
            _add_edge(
                entity_id,
                breach_id,
                "found_in",
                label=f"found in {leak_name}",
                capability="breach",
            )

            for rec in src.get("records", []):
                for email in rec.get("extracted_emails", []):
                    email_id = f"email:{email}"
                    derived_depth = depth + 1 if not is_seed_entity else 1
                    _add_node(
                        email_id,
                        email,
                        "email",
                        capability="breach",
                        via_seed=r["entity_value"],
                        via_seed_type=r["entity_type"],
                        depth=derived_depth,
                    )
                    _bump_evidence(email_id, dataset=leak_name)
                    _add_edge(
                        breach_id,
                        email_id,
                        "discovered_in",
                        label=f"via email in {leak_name}",
                        capability="breach",
                    )
                for phone in rec.get("extracted_phones", []):
                    phone_id = f"phone:{phone}"
                    derived_depth = depth + 1 if not is_seed_entity else 1
                    _add_node(
                        phone_id,
                        phone,
                        "phone",
                        capability="breach",
                        via_seed=r["entity_value"],
                        via_seed_type=r["entity_type"],
                        depth=derived_depth,
                    )
                    _bump_evidence(phone_id, dataset=leak_name)
                    _add_edge(
                        breach_id,
                        phone_id,
                        "discovered_in",
                        label=f"via phone in {leak_name}",
                        capability="breach",
                    )

    # ── Threat-intel: telegram groups (capability: financial proxy → use
    # "darkweb" only for forum/wallet; telegram mentions are messaging
    # signal, treat as darkweb adjacency since they're chat-channel hits).
    # NOTE: per branding map there is no "telegram" capability — telegram
    # mentions are routed under "darkweb" (chat surface). ────────────────
    threat_intel = sr.get("threat_intel", {}) or {}
    tg = threat_intel.get("telegram", {}) or {}
    if tg.get("found") and seed_id:
        for gid in (tg.get("group_ids") or [])[:10]:
            group_id = f"telegram_group:{gid}"
            _add_node(
                group_id,
                f"TG Group {gid}",
                "telegram_group",
                capability="darkweb",
                via_seed=seed_value,
                via_seed_type=seed_type,
                depth=1,
            )
            _bump_evidence(group_id, dataset="Telegram groups")
            _add_edge(
                seed_id,
                group_id,
                "mentioned_in",
                label="mentioned in Telegram group",
                capability="darkweb",
            )

    # ── Threat-intel: UPI (capability: financial) ───────────────────────
    for upi in (threat_intel.get("upi_ids") or []):
        upi_addr = (upi.get("upi_details") or {}).get("pa", "")
        if not upi_addr:
            continue
        upi_id = f"upi:{upi_addr}"
        site = upi.get("site") or ""
        _add_node(
            upi_id,
            upi_addr,
            "upi",
            capability="financial",
            via_seed=seed_value,
            via_seed_type=seed_type,
            depth=1,
            data={
                "classification": upi.get("clasification"),
                "site": site,
            },
        )
        _bump_evidence(upi_id, dataset=site or "UPI directory")
        if seed_id:
            _add_edge(
                seed_id,
                upi_id,
                "linked_upi",
                label=f"linked UPI ({site})" if site else "linked UPI",
                capability="financial",
            )

    # ── Threat-intel: email intel (capability: financial — UPI/bank/etc) ─
    for hit in (threat_intel.get("email_intel") or []):
        addr = hit.get("email") or hit.get("email_id") or ""
        if not addr:
            continue
        email_id = f"email:{addr}"
        _add_node(
            email_id,
            addr,
            "email",
            capability="financial",
            via_seed=seed_value,
            via_seed_type=seed_type,
            depth=1,
        )
        dataset = hit.get("source") or hit.get("site") or "Financial intel"
        _bump_evidence(email_id, dataset=dataset)

    # ── Threat-intel: watchlist matches (capability: watchlist) ─────────
    for wc in (threat_intel.get("worldcheck_matches") or []):
        name = wc.get("name") or wc.get("full_name") or wc.get("entity") or ""
        if not name:
            continue
        node_id = f"fullname:{name}"
        _add_node(
            node_id,
            name,
            "fullname",
            capability="watchlist",
            via_seed=seed_value,
            via_seed_type=seed_type,
            depth=1,
        )
        _bump_evidence(node_id, dataset=wc.get("source") or "World-Check")
        if seed_id and seed_id != node_id:
            _add_edge(
                seed_id,
                node_id,
                "watchlist_hit",
                label="watchlist match",
                capability="watchlist",
            )

    for cm in (threat_intel.get("crimedata_matches") or []):
        name = cm.get("name") or cm.get("full_name") or cm.get("subject") or ""
        if not name:
            continue
        node_id = f"fullname:{name}"
        _add_node(
            node_id,
            name,
            "fullname",
            capability="watchlist",
            via_seed=seed_value,
            via_seed_type=seed_type,
            depth=1,
        )
        _bump_evidence(node_id, dataset=cm.get("source") or "Crime data")
        if seed_id and seed_id != node_id:
            _add_edge(
                seed_id,
                node_id,
                "crimedata_hit",
                label="crime-data match",
                capability="watchlist",
            )

    # ── Darkweb: username matches (capability: darkweb) ─────────────────
    for uh in (sr.get("darkweb", {}) or {}).get("username_matches", []) or []:
        uname = uh.get("username", "")
        if not uname:
            continue
        dw_id = f"darkweb_account:{uname}"
        ap = uh.get("author_profile") or {}
        forum = ap.get("forum") or ""
        _add_node(
            dw_id,
            uname,
            "darkweb_account",
            capability="darkweb",
            via_seed=uname,
            via_seed_type="username",
            depth=1,
            data={"forum": forum, "posts": ap.get("total_posts")},
        )
        post_count = len(uh.get("posts") or []) + len(uh.get("threads") or [])
        _bump_evidence(dw_id, dataset=forum or "Darknet forum", count=max(1, post_count))
        if seed_id:
            _add_edge(
                seed_id,
                dw_id,
                "darkweb_alias",
                label=f"alias on {forum}" if forum else "darkweb alias",
                capability="darkweb",
            )

    # ── Court records (capability: court) ───────────────────────────────
    # The orchestrator may attach court hits under several keys; we look at
    # ``court`` and ``ecourts`` defensively. Only fields that are safe to
    # surface are read.
    for bucket_key in ("court", "ecourts"):
        bucket = sr.get(bucket_key) or {}
        for case in (bucket.get("cases") or bucket.get("results") or []):
            cid = case.get("cnr") or case.get("case_number") or case.get("id")
            if not cid:
                continue
            node_id = f"court_case:{cid}"
            title = case.get("title") or case.get("case_title") or str(cid)
            state_or_court = case.get("court") or case.get("state") or "Court records"
            _add_node(
                node_id,
                title,
                "court_case",
                capability="court",
                via_seed=seed_value,
                via_seed_type=seed_type,
                depth=1,
                data={"court": case.get("court"), "state": case.get("state")},
            )
            _bump_evidence(node_id, dataset=state_or_court)
            if seed_id:
                _add_edge(
                    seed_id,
                    node_id,
                    "court_party",
                    label=f"party in case ({state_or_court})",
                    capability="court",
                )

    # ── Financial: bank accounts / crypto (capability: financial) ──────
    for bank in (threat_intel.get("bank_accounts") or []):
        acct = bank.get("account_number") or bank.get("acc_no") or ""
        if not acct:
            continue
        node_id = f"bank_account:{acct}"
        site = bank.get("site_url") or bank.get("site") or "Bank accounts"
        _add_node(
            node_id,
            acct,
            "bank_account",
            capability="financial",
            via_seed=seed_value,
            via_seed_type=seed_type,
            depth=1,
        )
        _bump_evidence(node_id, dataset=site)
        if seed_id:
            _add_edge(
                seed_id,
                node_id,
                "linked_bank",
                label=f"linked bank account ({site})",
                capability="financial",
            )

    for tx in (threat_intel.get("crypto_transactions") or []):
        wallet = tx.get("wallet_address") or tx.get("address") or ""
        if not wallet:
            continue
        node_id = f"crypto_wallet:{wallet}"
        chain = tx.get("chain") or tx.get("currency") or "Crypto ledger"
        _add_node(
            node_id,
            wallet,
            "crypto_wallet",
            capability="financial",
            via_seed=seed_value,
            via_seed_type=seed_type,
            depth=1,
        )
        _bump_evidence(node_id, dataset=chain)
        if seed_id:
            _add_edge(
                seed_id,
                node_id,
                "linked_wallet",
                label=f"linked wallet ({chain})",
                capability="financial",
            )

    # ── Finalise per-node evidence_count + top-3 datasets ───────────────
    for node_id, node in node_index.items():
        node["origin"]["evidence_count"] = evidence_counter.get(node_id, 0)
        top = [name for name, _ in dataset_counter.get(node_id, Counter()).most_common(3)]
        node["origin"]["datasets"] = top

    return {"nodes": nodes, "edges": edges}
