"""Owner-visible execution evidence drawn from actual committed graph checkpoints."""

from fastapi import APIRouter
from sqlalchemy import select

from app.case_policy import own_case, timestamp
from app.models import AgentRun, AgentToolCall
from app.security import CurrentUser, SessionDep
from app.validation import validate_schema

router = APIRouter(prefix="/api/v1/complaints", tags=["Citizen complaints"])


@router.get("/{id}/agent-progress", operation_id="getCitizenAgentProgress")
def progress(id: str, user: CurrentUser, session: SessionDep):
    own_case(session, user, id)
    rows = session.execute(
        select(
            AgentRun.agent_run_id,
            AgentRun.next_step,
            AgentRun.created_at,
            AgentRun.updated_at,
            AgentRun.state["current_status"].as_string().label("current_status"),
            AgentRun.state["submission_reference"].as_string().label("submission_reference"),
        )
        .where(AgentRun.complaint_id == id, AgentRun.citizen_id == user.user_id)
        .order_by(AgentRun.created_at.desc(), AgentRun.agent_run_id.desc())
        .limit(10)
    ).all()
    steps = {row.agent_run_id: [] for row in rows}
    if steps:
        calls = session.execute(
            select(
                AgentToolCall.agent_run_id,
                AgentToolCall.step,
                AgentToolCall.timestamp,
                AgentToolCall.output["checkpoint_status"].as_string().label("checkpoint"),
                AgentToolCall.output["skipped"].as_string().label("skipped"),
            )
            .where(AgentToolCall.agent_run_id.in_(steps))
            .order_by(AgentToolCall.timestamp, AgentToolCall.call_id)
        ).all()
        for call in calls:
            status = (
                "blocked"
                if call.checkpoint in {"HUMAN_REVIEW", "NEEDS_INFORMATION"}
                else "skipped"
                if call.skipped == "reference_unknown"
                else "completed"
            )
            steps[call.agent_run_id].append(
                {"step": call.step, "status": status, "timestamp": timestamp(call.timestamp)}
            )
    result = {
        "runs": [
            {
                "agent_run_id": row.agent_run_id,
                "current_status": row.current_status,
                "next_step": row.next_step,
                "submission_reference": row.submission_reference,
                "started_at": timestamp(row.created_at),
                "updated_at": timestamp(row.updated_at),
                "steps": steps[row.agent_run_id],
            }
            for row in rows
        ]
    }
    validate_schema("CitizenAgentProgress", result)
    return result
