import hashlib
import json

from fastapi import APIRouter, HTTPException, Response
from sqlalchemy import select
from sqlalchemy.exc import SQLAlchemyError

from app.audit import record_event
from app.case_routes import CreateKey, IfMatch
from app.models import RoutingRule, RoutingVersion, Workspace
from app.routing import (
    RULE_FIELDS,
    append_snapshot,
    catalog,
    current_snapshot,
    install_rule,
    snapshot_view,
)
from app.security import AdminUser, SessionDep
from app.validation import validate_payload

router = APIRouter(prefix="/api/v1/admin")


def normalize(session, body, schema):
    validate_payload(schema, body)
    values = {k: v.strip() if isinstance(v, str) else v for k, v in body.items()}
    destination = values.get("destination_workspace_id")
    if destination is not None and session.get(Workspace, destination) is None:
        raise HTTPException(400, "Choose an existing simulated workspace.")
    return values


def find_rule(session, rule_id):
    record = session.scalar(
        select(RoutingRule)
        .where(RoutingRule.rule_id == rule_id)
        .with_for_update()
        .execution_options(populate_existing=True)
    )
    if record is None:
        raise HTTPException(404, "Routing rule does not exist.")
    return record


@router.get("/routing-rules", operation_id="listRoutingRules", tags=["Admin"])
def list_rules(admin: AdminUser, session: SessionDep):
    return [
        snapshot_view(snapshot)
        for snapshot in session.scalars(
            select(RoutingVersion)
            .join(RoutingRule, RoutingRule.rule_version_id == RoutingVersion.rule_version_id)
            .order_by(RoutingVersion.priority, RoutingRule.rule_id)
        )
    ]


@router.post("/routing-rules", operation_id="createRoutingRule", tags=["Admin"], status_code=201)
def create_rule(
    body: dict,
    response: Response,
    admin: AdminUser,
    session: SessionDep,
    idempotency_key: CreateKey = None,
):
    values = normalize(session, body, "RuleCreate")
    fingerprint = hashlib.sha256(
        json.dumps(values, sort_keys=True, ensure_ascii=False).encode()
    ).hexdigest()
    state = catalog(session)
    previous = (
        session.scalar(
            select(RoutingRule).where(
                RoutingRule.creator_id == admin.user_id,
                RoutingRule.create_idempotency_key == idempotency_key,
            )
        )
        if idempotency_key is not None
        else None
    )
    if previous is not None:
        if previous.create_fingerprint != fingerprint:
            raise HTTPException(409, "Idempotency key was used for a different routing rule.")
        response.status_code = 200
        snapshot = current_snapshot(session, previous)
        response.headers["ETag"] = f'"{snapshot.rule_version_id}"'
        return snapshot_view(snapshot)
    try:
        snapshot = install_rule(session, state, values, admin.user_id, idempotency_key, fingerprint)
        result = snapshot_view(snapshot)
        session.commit()
    except SQLAlchemyError:
        session.rollback()
        raise HTTPException(
            503, "Rule save outcome is uncertain. Reload rules or retry with the same key."
        ) from None
    response.headers["ETag"] = f'"{result["rule_version_id"]}"'
    return result


@router.patch("/routing-rules/{id}", operation_id="updateRoutingRule", tags=["Admin"])
def update_rule(
    id: str,
    body: dict,
    response: Response,
    admin: AdminUser,
    session: SessionDep,
    if_match: IfMatch = None,
):
    values = normalize(session, body, "RuleChange")
    state = catalog(session)
    rule = find_rule(session, id)
    previous = current_snapshot(session, rule)
    if if_match is not None and if_match != f'"{previous.rule_version_id}"':
        raise HTTPException(412, "Rule changed. Reload before editing.")
    current = {key: getattr(previous, key) for key in RULE_FIELDS}
    updated = {**current, **values}
    if updated == current:
        response.headers["ETag"] = f'"{previous.rule_version_id}"'
        return snapshot_view(previous)
    try:
        snapshot = append_snapshot(session, id, updated, admin.user_id)
        rule.rule_version_id = snapshot.rule_version_id
        state.generation += 1
        record_event(
            session,
            "routing.rule_revised",
            admin.user_id,
            "New immutable demo route version",
            rule_version_id=snapshot.rule_version_id,
            details={
                "rule_id": id,
                "previous_version_id": previous.rule_version_id,
                "generation": state.generation,
                "fields": sorted(values),
            },
        )
        result = snapshot_view(snapshot)
        session.commit()
    except SQLAlchemyError:
        session.rollback()
        raise HTTPException(
            503, "Rule save outcome is uncertain. Reload rules before retrying."
        ) from None
    response.headers["ETag"] = f'"{result["rule_version_id"]}"'
    return result


@router.get("/routing-rules/{id}/versions", operation_id="listRoutingRuleVersions", tags=["Admin"])
def list_versions(id: str, admin: AdminUser, session: SessionDep):
    if session.get(RoutingRule, id) is None:
        raise HTTPException(404, "Routing rule does not exist.")
    return [
        snapshot_view(snapshot)
        for snapshot in session.scalars(
            select(RoutingVersion)
            .where(RoutingVersion.rule_id == id)
            .order_by(RoutingVersion.timestamp, RoutingVersion.rule_version_id)
        )
    ]
