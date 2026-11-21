"""Deterministic demo routing and immutable historical decisions."""

from datetime import UTC, datetime
from uuid import uuid4

from fastapi import HTTPException
from sqlalchemy import select

from app.audit import record_event
from app.case_policy import timestamp
from app.models import RoutingCatalog, RoutingRule, RoutingVersion
from app.validation import schema_definitions

RULE_FIELDS = (
    "name",
    "incident_type",
    "destination_workspace_id",
    "priority",
    "active",
    "explanation",
    "justification",
)
SUPPORTED_TYPES = tuple(schema_definitions()["RuleCreate"]["properties"]["incident_type"]["enum"])
POLICY_VERSION = "routing-v1"


def catalog(session):
    record = session.scalar(
        select(RoutingCatalog)
        .where(RoutingCatalog.catalog_id == 1)
        .with_for_update()
        .execution_options(populate_existing=True)
    )
    if record is None:
        raise HTTPException(503, "Routing catalog is unavailable. Check migrations.")
    return record


def snapshot_view(snapshot):
    return {
        key: getattr(snapshot, key)
        for key in ("rule_id", "rule_version_id", *RULE_FIELDS, "created_by")
    } | {"timestamp": timestamp(snapshot.timestamp)}


def current_snapshot(session, rule):
    record = session.get(RoutingVersion, rule.rule_version_id)
    if record is None or record.rule_id != rule.rule_id:
        raise HTTPException(503, "Routing history is unavailable.")
    return record


def append_snapshot(session, rule_id, values, actor_id):
    snapshot = RoutingVersion(
        rule_id=rule_id,
        rule_version_id=str(uuid4()),
        **values,
        created_by=actor_id,
        timestamp=datetime.now(UTC),
    )
    session.add(snapshot)
    session.flush()
    return snapshot


def install_rule(session, state, values, actor_id, key=None, fingerprint=None):
    rule_id = str(uuid4())
    snapshot = append_snapshot(session, rule_id, values, actor_id)
    rule = RoutingRule(
        rule_id=rule_id,
        rule_version_id=snapshot.rule_version_id,
        creator_id=actor_id,
        create_idempotency_key=key,
        create_fingerprint=fingerprint,
    )
    session.add(rule)
    state.generation += 1
    record_event(
        session,
        "routing.rule_created",
        actor_id,
        "Demo routing version created",
        rule_version_id=snapshot.rule_version_id,
        details={"rule_id": rule_id, "generation": state.generation},
    )
    return snapshot


def pinned_snapshot(session, case):
    snapshot = session.get(RoutingVersion, case.rule_version_id) if case.rule_version_id else None
    if (
        snapshot is None
        or not snapshot.active
        or snapshot.destination_workspace_id != case.destination_workspace_id
    ):
        return None
    return snapshot


def resolve(session, case, incident_type):
    """Caller holds the catalog lock. Existing route pins are never silently replaced."""
    if case.rule_version_id is not None or case.destination_workspace_id is not None:
        snapshot = pinned_snapshot(session, case)
        if snapshot is None:
            return None, "invalid_pinned_route"
        if snapshot.incident_type != incident_type:
            return None, "pinned_route_mismatch"
        return snapshot, None
    if incident_type not in SUPPORTED_TYPES:
        return None, "no_matching_rule"
    snapshot = session.scalar(
        select(RoutingVersion)
        .join(RoutingRule, RoutingRule.rule_version_id == RoutingVersion.rule_version_id)
        .where(RoutingVersion.active.is_(True), RoutingVersion.incident_type == incident_type)
        .order_by(RoutingVersion.priority, RoutingRule.rule_id)
        .limit(1)
    )
    if snapshot is None:
        return None, "no_matching_rule"
    case.rule_version_id = snapshot.rule_version_id
    case.destination_workspace_id = snapshot.destination_workspace_id
    return snapshot, None


def decision(snapshot):
    if snapshot is None:
        return None
    return {
        key: getattr(snapshot, key)
        for key in (
            "rule_id",
            "rule_version_id",
            "destination_workspace_id",
            "incident_type",
            "explanation",
            "justification",
        )
    }


def seed_demo_routing(session):
    """Explicit seed command only. Never replace existing rules or reactivate disabled rules."""
    state = catalog(session)
    if session.scalar(select(RoutingRule.rule_id).limit(1)) is not None:
        return
    for incident_type in SUPPORTED_TYPES:
        install_rule(
            session,
            state,
            {
                "name": f"Demo intake: {incident_type}",
                "incident_type": incident_type,
                "destination_workspace_id": "mock-financial-fraud",
                "priority": 100,
                "active": True,
                "explanation": (
                    "This suspected online financial fraud report uses "
                    "Mock Financial Fraud Intake for the simulated demo."
                ),
                "justification": (
                    "Prototype routing fixture; not a verified official reporting destination."
                ),
            },
            "demo-admin",
        )
