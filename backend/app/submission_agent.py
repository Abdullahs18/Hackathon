"""Fixed LangGraph tools with transactional SQL checkpoints and idempotent local effects."""

from copy import deepcopy
from datetime import UTC, datetime, timedelta
from decimal import Decimal
from typing import TypedDict
from uuid import uuid4

from fastapi import HTTPException
from langgraph.graph import END, START, StateGraph
from langsmith import tracing_context
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError, SQLAlchemyError
from sqlalchemy.orm import Session

from app import mock_services
from app.audit import record_event
from app.case_policy import locked_case, own_case, timestamp
from app.models import (
    AgentRun,
    AgentToolCall,
    CaseAnalysis,
    MockIdentity,
    SubmissionAuthorization,
    User,
)
from app.notifications import notify_case
from app.submission_policy import check_binding, require_approval
from app.validation import validate_schema

STEPS = ("identity", "payment", "requirements", "submit", "verify")


def citizen(session, user_id):
    user = session.get(User, user_id, populate_existing=True)
    if user is None or not user.active or user.role != "Citizen":
        raise HTTPException(403, "Current Citizen access is required.")
    return user


def locked_run(session, case, run_id):
    run = session.scalar(
        select(AgentRun)
        .where(AgentRun.agent_run_id == run_id)
        .with_for_update()
        .execution_options(populate_existing=True)
    )
    if run is None or run.complaint_id != case.complaint_id or run.citizen_id != case.citizen_id:
        raise HTTPException(404, "Agent run does not exist in this own case.")
    return run


def run_view(session, case, run):
    result = deepcopy(run.state)
    approval = session.get(SubmissionAuthorization, run.authorization_id)
    active = True
    try:
        require_approval(session, case, approval)
    except HTTPException:
        active = False
    result.update(
        consent_granted=active,
        citizen_authorized=active,
        next_step=run.next_step,
        created_at=timestamp(run.created_at),
        updated_at=timestamp(run.updated_at),
    )
    validate_schema("agent_runs", result)
    return result


def execution_view(run):
    return {
        "simulated": True,
        "submitted": run.next_step == "done",
        "agent_run_id": run.agent_run_id,
        "current_status": run.state["current_status"],
        "submission_reference": run.state["submission_reference"],
        "warnings": run.state["warnings"],
        "errors": run.state["errors"],
    }


def checkpoint(case, approval, run, state, next_step, status):
    case.version += 1
    case.current_status = status
    case.updated_at = datetime.now(UTC)
    approval.expected_version = case.version
    state.update(current_status=status, next_step=next_step)
    run.state = state
    run.next_step = next_step
    run.updated_at = case.updated_at
    run.lease_until = case.updated_at + timedelta(seconds=60)


def blocked(case, approval, run, state, code, status="HUMAN_REVIEW"):
    state["errors"] = [code]
    state["citizen_authorized"] = False
    approval.revoked_at = datetime.now(UTC)
    if case.complaint_draft:
        case.complaint_draft = {**case.complaint_draft, "citizen_confirmed": False}
    checkpoint(case, approval, run, state, "blocked", status)


def perform_step(engine, store, run_id, actor_id, token, step):
    if step not in STEPS:
        raise HTTPException(409, "Agent step is not allowlisted.")
    with Session(engine) as session:
        existing = session.get(AgentRun, run_id)
        if existing is None:
            raise HTTPException(404, "Agent run does not exist.")
        case = own_case(session, citizen(session, actor_id), existing.complaint_id)
        run = locked_run(session, case, run_id)
        if run.lease_token != token:
            raise HTTPException(409, "This agent execution lease is no longer current.")
        if run.next_step != step:
            return run.next_step, False
        approval = session.get(SubmissionAuthorization, run.authorization_id)
        if step == "verify":
            check_binding(session, case, approval)
        else:
            require_approval(session, case, approval)
        state = deepcopy(run.state)
        args = {}
        result = {"simulated": True}
        next_step = STEPS[STEPS.index(step) + 1] if step != "verify" else "done"
        status = "MOCK_SERVICE_CALLS"
        filed_now = False
        if step == "identity":
            ref = session.scalar(
                select(MockIdentity.identity_reference).where(MockIdentity.user_id == actor_id)
            )
            args = {"reference": ref}
            if ref is None:
                blocked(
                    case, approval, run, state, "identity_fixture_not_found", "NEEDS_INFORMATION"
                )
            else:
                result = mock_services.identity(session, ref, actor_id)
        elif step == "payment":
            ref = (case.incident_data.get("transaction_reference") or "").strip()
            args = {"reference": ref or None}
            if not ref:
                result = {"simulated": True, "skipped": "reference_unknown"}
            else:
                try:
                    result = mock_services.payment(session, ref, actor_id)
                except HTTPException as exc:
                    if exc.status_code == 404:
                        result = {"simulated": True, "not_found": True}
                        state["warnings"].append("payment_not_found")
                    elif exc.status_code == 403:
                        blocked(case, approval, run, state, "payment_fixture_scope_conflict")
                    else:
                        raise
                else:
                    facts = case.incident_data
                    if (
                        (
                            facts.get("amount") is not None
                            and Decimal(str(result["amount"])) != Decimal(str(facts["amount"]))
                        )
                        or (
                            facts.get("currency")
                            and result["currency"].casefold() != facts["currency"].casefold()
                        )
                        or (
                            facts.get("payment_method")
                            and result["payment_method"] != facts["payment_method"]
                        )
                    ):
                        blocked(case, approval, run, state, "payment_details_conflict")
        elif step == "requirements":
            kind = approval.payload["request"]["complaint_draft"]["incident_type"]
            args = {"incident_type": kind}
            try:
                result = mock_services.requirements(session, kind)
            except HTTPException as exc:
                if exc.status_code == 404:
                    blocked(case, approval, run, state, "requirements_unavailable")
                else:
                    raise
            else:
                required = set(result["requirements"])
                if case.incident_data.get("money_lost") is not True:
                    required -= {"amount", "currency"}
                if any(
                    case.incident_data.get(k) is None
                    or case.incident_data.get(k) == ""
                    or case.incident_data.get(k) == []
                    for k in required
                ):
                    blocked(
                        case,
                        approval,
                        run,
                        state,
                        "reporting_information_missing",
                        "NEEDS_INFORMATION",
                    )
        elif step == "submit":
            args = deepcopy(approval.payload["request"])
            try:
                row, filed_now = mock_services.file_complaint(session, case, approval, run, store)
            except HTTPException as exc:
                if exc.status_code == 409 and exc.detail == "possible_duplicate":
                    blocked(case, approval, run, state, "possible_duplicate")
                else:
                    raise
            else:
                result = mock_services.confirmation(row)
                state["submission_reference"] = row.submission_reference
                case.submission_reference = row.submission_reference
                status = "SUBMISSION_VERIFICATION"
        elif step == "verify":
            args = {"idempotency_key": run.idempotency_key}
            # Verify the receipt already delivered and checkpointed by the submit tool.
            # No new recipient read or disclosure occurs, including after consent withdrawal.
            call = session.scalar(
                select(AgentToolCall).where(
                    AgentToolCall.agent_run_id == run_id, AgentToolCall.step == "submit"
                )
            )
            if call is None or call.input != approval.payload["request"]:
                raise HTTPException(
                    503, "Submission outcome is uncertain. Retry the same key later."
                )
            result = {
                k: call.output.get(k)
                for k in ["complaint_id", "idempotency_key", "submission_reference", "simulated"]
            }
            validate_schema("SubmissionConfirmation", result)
            if (
                result["complaint_id"] != case.complaint_id
                or result["idempotency_key"] != run.idempotency_key
                or result["submission_reference"] != case.submission_reference
            ):
                raise HTTPException(409, "Saved receipt does not match this approved run.")
            state["submission_reference"] = result["submission_reference"]
            status = "SUBMITTED"
        else:
            raise HTTPException(409, "Agent step is not allowlisted.")
        if run.next_step != "blocked":
            checkpoint(case, approval, run, state, next_step, status)
        if run.next_step == "done":
            notify_case(
                session,
                case,
                "submission:" + run_id,
                "Your simulated complaint was submitted and its receipt was confirmed.",
            )
        elif run.next_step == "blocked":
            notify_case(
                session,
                case,
                "agent-blocked:" + run_id,
                "This simulated complaint needs clarification or human review before filing.",
            )
        result = {**result, "checkpoint_status": run.state["current_status"]}
        session.add(
            AgentToolCall(
                call_id=str(uuid4()),
                agent_run_id=run_id,
                step=step,
                input=args,
                output=result,
                timestamp=datetime.now(UTC),
            )
        )
        record_event(
            session,
            "agent.tool_completed",
            actor_id,
            "Simulated allowlisted tool checkpoint saved",
            complaint_id=case.complaint_id,
            rule_version_id=case.rule_version_id,
            details={"agent_run_id": run_id, "tool": step, "next_step": run.next_step},
        )
        validate_schema("agent_runs", run.state)
        next_value = run.next_step
        session.commit()
        return next_value, filed_now


class GraphState(TypedDict):
    run_id: str
    next_step: str
    filed_now: bool


def invoke_graph(engine, store, run_id, actor_id, token, next_step, before_step=None):
    graph = StateGraph(GraphState)

    def node(step):
        def invoke(state):
            if before_step is not None:
                before_step(step)
            next_step, created = perform_step(engine, store, state["run_id"], actor_id, token, step)
            return {"next_step": next_step, "filed_now": state["filed_now"] or created}

        return invoke

    def route(state):
        if state["next_step"] in STEPS:
            return state["next_step"]
        if state["next_step"] in {"done", "blocked"}:
            return END
        raise HTTPException(409, "Agent step is not allowlisted.")

    choices = {name: name for name in STEPS} | {END: END}
    for step in STEPS:
        graph.add_node(step, node(step))
        graph.add_conditional_edges(step, route, choices)
    graph.add_conditional_edges(START, route, choices)
    # Environment tracing flags must not export private tool failures or checkpoint metadata.
    with tracing_context(enabled=False, parent=False):
        return graph.compile().invoke(
            {"run_id": run_id, "next_step": next_step, "filed_now": False},
            {"recursion_limit": 12, "callbacks": []},
        )


def start_execution(
    engine, store, actor_id, case_id, authorization_id, key, request_payload=None, before_step=None
):
    token = str(uuid4())
    with Session(engine) as session:
        case = own_case(session, citizen(session, actor_id), case_id)
        run = session.scalar(
            select(AgentRun).where(AgentRun.citizen_id == actor_id, AgentRun.idempotency_key == key)
        )
        if run is not None and (
            run.complaint_id != case_id or run.authorization_id != authorization_id
        ):
            raise HTTPException(409, "Idempotency key is bound to a different approved complaint.")
        approval = session.get(SubmissionAuthorization, authorization_id)
        if approval is None or approval.complaint_id != case_id or approval.citizen_id != actor_id:
            raise HTTPException(409, "Choose the current own-case authorization.")
        if request_payload is not None and request_payload != approval.payload["request"]:
            raise HTTPException(409, "Request differs from the citizen-approved payload.")
        if run is not None and run.next_step in {"done", "blocked"}:
            return execution_view(run), False
        if run is not None and run.next_step == "verify":
            check_binding(session, case, approval)
        else:
            require_approval(session, case, approval)
        if run is None:
            other = session.scalar(
                select(AgentRun).where(AgentRun.authorization_id == authorization_id)
            )
            if other is not None:
                raise HTTPException(
                    409, "This approval already has a submission key. Recover its saved run."
                )
            now = datetime.now(UTC)
            analysis = session.get(CaseAnalysis, approval.analysis_id)
            state = {
                "agent_run_id": str(uuid4()),
                "authorization_id": authorization_id,
                "complaint_id": case_id,
                "citizen_id": actor_id,
                "language": "und",
                "transcript": None,
                "incident_data": deepcopy(case.incident_data),
                "classification": deepcopy(analysis.result["classification"]),
                "readiness_score": analysis.result["readiness_score"],
                "missing_fields": analysis.result["classification"]["missing_fields"],
                "contradiction_flags": analysis.result["classification"]["contradiction_flags"],
                "rule_version_id": case.rule_version_id,
                "destination_workspace_id": case.destination_workspace_id,
                "consent_granted": True,
                "citizen_authorized": True,
                "idempotency_key": key,
                "submission_reference": None,
                "current_status": "AGENT_EXECUTION",
                "errors": [],
                "warnings": [],
            }
            run = AgentRun(
                agent_run_id=state["agent_run_id"],
                complaint_id=case_id,
                citizen_id=actor_id,
                authorization_id=authorization_id,
                idempotency_key=key,
                fingerprint=approval.fingerprint,
                next_step="identity",
                state=state,
                created_at=now,
                updated_at=now,
            )
            session.add(run)
            case.agent_run_id = run.agent_run_id
            checkpoint(case, approval, run, state, "identity", "AGENT_EXECUTION")
        now = datetime.now(UTC)
        until = run.lease_until
        if (
            run.lease_token
            and until
            and (until.replace(tzinfo=UTC) if until.tzinfo is None else until) > now
        ):
            raise HTTPException(
                429,
                "Submission is already executing. Retry after the active lease.",
                {"Retry-After": "60"},
            )
        run.lease_token = token
        run.lease_until = now + timedelta(seconds=60)
        run_id, step = run.agent_run_id, run.next_step
        record_event(
            session,
            "agent.execution_claimed",
            actor_id,
            "Agent execution lease claimed",
            complaint_id=case_id,
            details={"agent_run_id": run_id, "next_step": step},
        )
        try:
            session.commit()
        except IntegrityError:
            session.rollback()
            prior = session.scalar(
                select(AgentRun).where(
                    AgentRun.citizen_id == actor_id, AgentRun.idempotency_key == key
                )
            )
            if prior and (
                prior.complaint_id != case_id or prior.authorization_id != authorization_id
            ):
                raise HTTPException(
                    409, "Idempotency key conflicts with another approved complaint."
                ) from None
            raise HTTPException(
                503, "Submission start is uncertain. Read saved runs before retrying the same key."
            ) from None
        except SQLAlchemyError:
            session.rollback()
            raise HTTPException(
                503, "Submission start is uncertain. Read saved runs before retrying the same key."
            ) from None
    try:
        graph_result = invoke_graph(engine, store, run_id, actor_id, token, step, before_step)
        with Session(engine) as session:
            case = own_case(session, citizen(session, actor_id), case_id)
            return execution_view(locked_run(session, case, run_id)), graph_result["filed_now"]
    except (SQLAlchemyError, TimeoutError):
        raise HTTPException(
            503, "Submission outcome is uncertain. Read saved progress and retry the same key."
        ) from None
    finally:
        try:
            with Session(engine) as session, session.begin():
                case = locked_case(session, case_id)
                run = locked_run(session, case, run_id)
                if run.lease_token == token:
                    run.lease_token = None
                    run.lease_until = None
        except Exception:
            pass  # Expiring lease permits recovery if the DB is temporarily unavailable.
