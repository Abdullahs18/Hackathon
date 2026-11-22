"""Discover confirmed filings without granting administrators raw citizen case access."""

from typing import Literal
from uuid import UUID

from fastapi import APIRouter, HTTPException
from sqlalchemy import and_, or_, select

from app.api_key_routes import PageLimit
from app.case_policy import timestamp
from app.models import CaseAssignment, Complaint, Consent, MockSubmission, User
from app.security import AdminUser, SessionDep
from app.validation import validate_schema

router = APIRouter(prefix="/api/v1/admin", tags=["Admin"])


@router.get("/complaints", operation_id="listAdminAssignmentQueue")
def assignment_queue(
    admin: AdminUser,
    session: SessionDep,
    assignment: Literal["unassigned", "assigned", "all"] = "unassigned",
    limit: PageLimit = 25,
    before: UUID | None = None,
):
    statement = (
        select(
            MockSubmission.submission_id,
            Complaint.complaint_id,
            MockSubmission.submission_reference,
            MockSubmission.destination_workspace_id,
            Complaint.current_status,
            Complaint.review_outcome,
            MockSubmission.created_at,
            CaseAssignment.officer_id,
        )
        .select_from(MockSubmission)
        .join(Complaint, Complaint.complaint_id == MockSubmission.complaint_id)
        .outerjoin(CaseAssignment, CaseAssignment.complaint_id == Complaint.complaint_id)
        .where(
            Complaint.current_status.in_({"SUBMITTED", "OFFICER_REVIEW"}),
            Complaint.submission_reference == MockSubmission.submission_reference,
            Complaint.destination_workspace_id == MockSubmission.destination_workspace_id,
            Complaint.rule_version_id == MockSubmission.rule_version_id,
        )
    )
    if assignment == "unassigned":
        statement = statement.where(CaseAssignment.officer_id.is_(None))
    elif assignment == "assigned":
        statement = statement.where(CaseAssignment.officer_id.is_not(None))
    if before is not None:
        anchor = session.execute(
            statement.where(MockSubmission.submission_id == str(before)).with_only_columns(
                MockSubmission.created_at, MockSubmission.submission_id
            )
        ).first()
        if anchor is None:
            raise HTTPException(400, "Cursor does not exist within this assignment filter.")
        statement = statement.where(
            or_(
                MockSubmission.created_at < anchor.created_at,
                and_(
                    MockSubmission.created_at == anchor.created_at,
                    MockSubmission.submission_id < anchor.submission_id,
                ),
            )
        )
    rows = session.execute(
        statement.order_by(
            MockSubmission.created_at.desc(), MockSubmission.submission_id.desc()
        ).limit(limit + 1)
    ).all()
    items = []
    for row in rows[:limit]:
        scopes = session.scalar(
            select(Consent.data_scopes)
            .join(Complaint, Complaint.complaint_id == Consent.complaint_id)
            .where(
                Consent.complaint_id == row.complaint_id,
                Consent.citizen_id == Complaint.citizen_id,
                Consent.recipient == "workspace:" + row.destination_workspace_id,
                Consent.purpose == "complaint_submission",
                Consent.status == "granted",
            )
        )
        items.append(
            {
                "complaint_id": row.complaint_id,
                "submission_reference": row.submission_reference,
                "destination_workspace_id": row.destination_workspace_id,
                "current_status": row.current_status,
                "review_outcome": row.review_outcome or "pending",
                "submitted_at": timestamp(row.created_at),
                "assigned_officer_id": row.officer_id,
                "recipient_consent_active": "case_status" in (scopes or []),
            }
        )
    officers = session.execute(
        select(User.user_id, User.workspace_id)
        .where(User.role == "Officer", User.active.is_(True), User.workspace_id.is_not(None))
        .order_by(User.workspace_id, User.user_id)
    ).all()
    result = {
        "items": items,
        "officers": [
            {"user_id": row.user_id, "workspace_id": row.workspace_id} for row in officers
        ],
        "next_cursor": rows[limit - 1].submission_id if len(rows) > limit else None,
    }
    validate_schema("AdminAssignmentQueue", result)
    return result
