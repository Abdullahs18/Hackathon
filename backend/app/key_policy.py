"""API keys add resource scopes; they never replace account, case or consent policy."""

from datetime import UTC, datetime

from fastapi import HTTPException

from app.models import ApiKey

ROLE_SCOPES = {
    "Citizen": {
        "complaints:read",
        "complaints:write",
        "consents:read",
        "consents:write",
        "mock:services",
        "notifications:read",
    },
    "Helper": {"helper:access", "notifications:read"},
    "Officer": {"officer:access", "notifications:read"},
    "Admin": {
        "admin:users",
        "admin:cases",
        "admin:rules",
        "admin:audit",
        "admin:api_keys",
        "mock:services",
        "notifications:read",
    },
}

OPERATION_SCOPES = {"getMe": None}
OPERATION_SCOPES.update(
    {name: None for name in ["listOwnApiKeys", "createOwnApiKey", "revokeOwnApiKey"]}
)
for scope, operations in {
    "complaints:read": (
        "listComplaints getComplaint listEvidence getEvidence downloadEvidence "
        "getComplaintAnalysis getSubmissionAuthorization listCitizenAgentRuns "
        "getCitizenAgentRun listCitizenReviewHistory listHelperGrants"
    ),
    "complaints:write": (
        "createComplaint updateComplaint uploadEvidence analyzeComplaint authorizeSubmission "
        "revokeSubmissionAuthorization executeSubmission replyToOfficer "
        "grantHelperAccess revokeHelperAccess"
    ),
    "consents:read": "listConsents",
    "consents:write": "grantConsent changeConsent withdrawConsent",
    "helper:access": "listHelperComplaints addHelperInformation",
    "officer:access": (
        "listOfficerComplaints getOfficerComplaint takeOfficerAction listOfficerReviewHistory"
    ),
    "admin:users": "listUsers createUser",
    "admin:cases": "assignOfficer",
    "admin:rules": "listRoutingRules createRoutingRule updateRoutingRule listRoutingRuleVersions",
    "admin:audit": "listAudit listAgentRuns",
    "admin:api_keys": "listApiKeys createApiKey revokeApiKey",
    "mock:services": (
        "getMockIdentity getMockPayment getMockRequirements submitMockComplaint findMockSubmission"
    ),
    "notifications:read": "listNotifications readNotification",
}.items():
    OPERATION_SCOPES.update({operation: scope for operation in operations.split()})

# Evidence URLs are shared by owners, authorized Helpers and assigned Officers.
for operation in ["listEvidence", "getEvidence", "downloadEvidence"]:
    OPERATION_SCOPES[operation] = {"complaints:read", "helper:access", "officer:access"}
OPERATION_SCOPES["uploadEvidence"] = {"complaints:write", "helper:access"}


def aware(value):
    return value.replace(tzinfo=UTC) if value.tzinfo is None else value.astimezone(UTC)


def active_key(session, key_id, principal_id=None):
    row = session.get(ApiKey, key_id, populate_existing=True)
    if (
        row is None
        or row.revoked
        or aware(row.expires_at) <= datetime.now(UTC)
        or (principal_id is not None and row.principal_id != principal_id)
    ):
        raise HTTPException(
            401, "Valid authentication is required.", {"WWW-Authenticate": "Bearer"}
        )
    return row


def require_key_scope(row, user, operation_id):
    if operation_id not in OPERATION_SCOPES:
        raise HTTPException(403, "API key access is not enabled for this operation.")
    required = OPERATION_SCOPES[operation_id]
    choices = {required} if isinstance(required, str) else required
    if required is not None and not (
        set(choices) & set(row.scopes) & ROLE_SCOPES.get(user.role, set())
    ):
        raise HTTPException(403, "This API key lacks the required resource scope.")


def recheck_key(session, key_id, user, operation_id):
    if key_id is not None:
        require_key_scope(active_key(session, key_id, user.user_id), user, operation_id)
