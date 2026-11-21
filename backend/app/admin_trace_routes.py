"""Admin observability is a metadata projection, never an implicit raw-case data grant."""

import json
from uuid import UUID

from fastapi import APIRouter, Response
from sqlalchemy import select

from app.api_key_routes import PageLimit
from app.case_policy import timestamp
from app.models import AgentRun, AgentToolCall, AuditLog
from app.pagination import page
from app.security import AdminUser, SessionDep
from app.validation import schema_definitions

router = APIRouter(prefix="/api/v1/admin", tags=["Admin"])
ACTION_MESSAGES = {
    "auth.login": "Account authenticated.",
    "auth.login_denied": "Authentication was denied.",
    "admin.user_created": "An account was created.",
    "complaint.created": "A complaint draft was created.",
    "complaint.updated": "A draft was updated.",
    "helper.granted": "Helper access was granted.",
    "helper.revoked": "Helper access was revoked.",
    "helper.information_added": "A helper updated authorized draft fields.",
    "consent.granted": "Sharing consent was granted.",
    "consent.changed": "Sharing consent changed.",
    "consent.withdrawn": "Sharing consent was withdrawn.",
    "officer.assigned": "An officer was assigned.",
    "notification.read": "A notification was marked read.",
    "analysis.external_processing_authorized": "The citizen allowed external assessment.",
    "analysis.completed": "Assessment was saved.",
    "analysis.failed": "Assessment did not complete.",
    "analysis.discarded": "An assessment was discarded before saving.",
    "analysis.assessment_reused": "A saved assessment was reused.",
    "routing.evaluated": "A routing snapshot was selected or reviewed.",
    "routing.preserved": "An existing routing snapshot was preserved.",
    "routing.rule_created": "A routing rule was created.",
    "routing.rule_revised": "A new immutable routing version was created.",
    "submission.authorized": "The citizen authorized a reviewed revision.",
    "submission.authorization_revoked": "An unfiled authorization was revoked.",
    "agent.execution_claimed": "A fixed agent execution was claimed.",
    "agent.tool_completed": "An allowlisted tool checkpoint was saved.",
    "mock.identity_read": "A simulated identity lookup occurred.",
    "mock.payment_read": "A simulated payment lookup occurred.",
    "mock.requirements_read": "Simulated requirements were read.",
    "mock.confirmation_read": "A simulated confirmation was read.",
    "evidence.uploaded": "Private evidence was attached.",
    "evidence.listed": "Authorized evidence metadata was listed.",
    "evidence.metadata_read": "Authorized evidence metadata was read.",
    "evidence.downloaded": "A protected original was read.",
    "api_key.created": "A scoped credential was issued; its secret is not recorded here.",
    "api_key.revoked": "An API key was revoked.",
    "review.request_information": "An officer requested information.",
    "review.provide_information": "The citizen supplied a review supplement.",
    "review.accept": "An officer accepted the case for review.",
    "review.reject": "An officer rejected the case.",
    "review.escalate": "An officer escalated review within the pinned workspace.",
    "review.close": "An officer closed the case.",
}


def opaque(value):
    try:
        return str(UUID(value)) if isinstance(value, str) else None
    except (ValueError, AttributeError):
        return None


def safe_metadata(raw):
    try:
        source = json.loads(raw) if raw else {}
    except (TypeError, ValueError):
        return {}
    if not isinstance(source, dict):
        return {}
    result = {}
    for name in ["version", "input_version", "complaint_version", "reviewed_version", "generation"]:
        value = source.get(name)
        if type(value) is int and 0 <= value <= 2147483647:
            result[name] = value
    for name in [
        "agent_run_id",
        "analysis_id",
        "event_id",
        "rule_id",
        "rule_version_id",
        "authorization_id",
        "api_key_id",
        "notification_id",
        "consent_id",
    ]:
        value = opaque(source.get(name))
        if value:
            result[name] = value
    if isinstance(source.get("tool"), str) and source["tool"] in {
        "identity",
        "payment",
        "requirements",
        "submit",
        "verify",
    }:
        result["tool"] = source["tool"]
    if isinstance(source.get("next_step"), str) and source["next_step"] in {
        "identity",
        "payment",
        "requirements",
        "submit",
        "verify",
        "done",
        "blocked",
    }:
        result["next_step"] = source["next_step"]
    outcomes = {
        "pending",
        "information_requested",
        "information_received",
        "accepted",
        "rejected",
        "escalated",
        "closed",
    }
    for name in ["outcome", "previous_outcome"]:
        if isinstance(source.get(name), str) and source[name] in outcomes:
            result[name] = source[name]
    fields = source.get("fields")
    if isinstance(fields, list):
        allowed = set(schema_definitions()["IncidentInformation"]["properties"])
        result["field_count"] = sum(
            isinstance(item, str) and item in allowed for item in fields[:100]
        )
    return result


@router.get("/audit", operation_id="listAudit")
def list_audit(
    response: Response,
    admin: AdminUser,
    session: SessionDep,
    before: UUID | None = None,
    complaint_id: UUID | None = None,
    limit: PageLimit = 50,
):
    query = select(AuditLog)
    if complaint_id is not None:
        query = query.where(AuditLog.complaint_id == str(complaint_id))
    rows = page(
        session,
        query,
        AuditLog,
        AuditLog.audit_log_id,
        AuditLog.timestamp,
        before,
        limit,
        response,
        complaint_id,
    )
    result = []
    for item in rows:
        row = item[0]
        data = safe_metadata(row.input)
        action = row.action if row.action in ACTION_MESSAGES else "other"
        result.append(
            {
                "audit_log_id": row.audit_log_id,
                "complaint_id": opaque(row.complaint_id),
                "user_id": None if action.startswith("api_key.") else row.user_id,
                "agent_run_id": opaque(row.agent_run_id) or data.get("agent_run_id"),
                "action": action,
                "input": json.dumps(data, sort_keys=True) if data else None,
                "result": ACTION_MESSAGES.get(
                    action, "Recorded application event; private details omitted."
                ),
                "rule_version_id": opaque(row.rule_version_id),
                "timestamp": timestamp(row.timestamp),
                "redacted": True,
            }
        )
    return result


def status(value):
    return (
        value
        if isinstance(value, str) and value in schema_definitions()["WorkflowStatus"]["enum"]
        else "UNKNOWN"
    )


OUTCOME_MESSAGES = {
    "identity_fixture_not_found": "A synthetic identity fixture was unavailable.",
    "payment_fixture_scope_conflict": "The synthetic payment was outside the citizen's scope.",
    "payment_details_conflict": "Known synthetic payment details conflicted with reported facts.",
    "requirements_unavailable": "Simulated reporting requirements were unavailable.",
    "reporting_information_missing": "Required reporting information was missing.",
    "possible_duplicate": "The duplicate guard stopped another filing.",
    "payment_not_found": "No synthetic payment fixture matched; this is not proof of invalidity.",
    "unknown_failure": "A private or unrecognized failure was omitted.",
    "unknown_warning": "A private or unrecognized warning was omitted.",
}


def outcome_summaries(errors, warnings):
    codes = []
    for values, fallback in [(errors, "unknown_failure"), (warnings, "unknown_warning")]:
        if not values:
            continue
        if not isinstance(values, list):
            values = [fallback]
        for value in values[:100]:
            code = value if isinstance(value, str) and value in OUTCOME_MESSAGES else fallback
            if code not in codes:
                codes.append(code)
    return [{"code": code, "explanation": OUTCOME_MESSAGES[code]} for code in codes]


@router.get("/agent-runs", operation_id="listAgentRuns")
def list_runs(
    response: Response,
    admin: AdminUser,
    session: SessionDep,
    before: UUID | None = None,
    complaint_id: UUID | None = None,
    limit: PageLimit = 50,
):
    # Select only safe JSON fields; transcripts/facts/classification never enter this view.
    query = select(
        AgentRun.agent_run_id,
        AgentRun.complaint_id,
        AgentRun.next_step,
        AgentRun.created_at,
        AgentRun.updated_at,
        AgentRun.state["current_status"].as_string().label("current_status"),
        AgentRun.state["rule_version_id"].as_string().label("rule_version_id"),
        AgentRun.state["destination_workspace_id"].as_string().label("workspace"),
        AgentRun.state["errors"].label("errors"),
        AgentRun.state["warnings"].label("warnings"),
    )
    if complaint_id is not None:
        query = query.where(AgentRun.complaint_id == str(complaint_id))
    rows = page(
        session,
        query,
        AgentRun,
        AgentRun.agent_run_id,
        AgentRun.created_at,
        before,
        limit,
        response,
        complaint_id,
    )
    by_run = {row.agent_run_id: [] for row in rows}
    if by_run:
        tools = session.execute(
            select(
                AgentToolCall.call_id,
                AgentToolCall.agent_run_id,
                AgentToolCall.step,
                AgentToolCall.timestamp,
                AgentToolCall.output["checkpoint_status"].as_string().label("result_status"),
            )
            .where(AgentToolCall.agent_run_id.in_(by_run))
            .order_by(AgentToolCall.timestamp, AgentToolCall.call_id)
        )
        for tool in tools:
            by_run[tool.agent_run_id].append(
                {
                    "call_id": tool.call_id,
                    "tool": tool.step
                    if tool.step in {"identity", "payment", "requirements", "submit", "verify"}
                    else "unknown",
                    "result_status": status(tool.result_status),
                    "timestamp": timestamp(tool.timestamp),
                }
            )
    return [
        {
            "agent_run_id": row.agent_run_id,
            "complaint_id": row.complaint_id,
            "rule_version_id": opaque(row.rule_version_id),
            "destination_workspace_id": row.workspace
            if row.workspace in {"mock-financial-fraud", "mock-digital-safety"}
            else None,
            "current_status": status(row.current_status),
            "next_step": row.next_step
            if row.next_step
            in {"identity", "payment", "requirements", "submit", "verify", "done", "blocked"}
            else "unknown",
            "submitted": row.next_step == "done",
            "tools": by_run[row.agent_run_id],
            "outcomes": outcome_summaries(row.errors, row.warnings),
            "created_at": timestamp(row.created_at),
            "updated_at": timestamp(row.updated_at),
            "redacted": True,
        }
        for row in rows
    ]
