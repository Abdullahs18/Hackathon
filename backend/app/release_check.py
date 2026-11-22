"""Read-only deployed API smoke check; no cases or provider calls are created."""

import argparse
import json
import os

import httpx

OPERATIONS = {
    "requestReviewHelp",
    "getReviewHelp",
    "acknowledgeReviewHelp",
    "respondReviewHelp",
    "getCitizenAgentProgress",
}
ROLES = {
    "demo-citizen-1": "Citizen",
    "demo-helper": "Helper",
    "demo-officer-financial": "Officer",
    "demo-officer-digital": "Officer",
    "demo-admin": "Admin",
}


def check(client, password=None, origin=None):
    results = []
    for path in ["/api/v1/health", "/api/v1/health/ready"]:
        response = client.get(path)
        results.append(
            {
                "check": path,
                "passed": response.status_code == 200
                and response.json() == {"status": "ok", "simulated": True},
            }
        )
    if origin:
        response = client.options(
            "/api/v1/auth/login",
            headers={
                "Origin": origin,
                "Access-Control-Request-Method": "POST",
                "Access-Control-Request-Headers": "content-type",
            },
        )
        results.append(
            {
                "check": "frontend_cors",
                "passed": response.status_code == 200
                and response.headers.get("access-control-allow-origin") == origin,
            }
        )
    response = client.get("/openapi.json")
    spec = response.json() if response.status_code == 200 else {}
    actual = {
        operation.get("operationId")
        for methods in spec.get("paths", {}).values()
        for operation in methods.values()
        if isinstance(operation, dict)
    }
    results.append({"check": "current_operations", "passed": OPERATIONS <= actual})
    if password:
        for user, role in ROLES.items():
            login = client.post("/api/v1/auth/login", json={"user_id": user, "password": password})
            token = login.json().get("access_token") if login.status_code == 200 else None
            me = (
                client.get("/api/v1/auth/me", headers={"Authorization": "Bearer " + token})
                if token
                else None
            )
            results.append(
                {
                    "check": role + ":" + user,
                    "passed": me is not None
                    and me.status_code == 200
                    and me.json().get("role") == role,
                }
            )
    return {
        "passed": all(row["passed"] for row in results),
        "checks": results,
        "role_checks_requested": bool(password),
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--base-url", default="http://127.0.0.1:8000")
    parser.add_argument("--origin", help="Exact frontend origin to verify the login preflight.")
    parser.add_argument(
        "--roles", action="store_true", help="Use DASTAK_DEMO_PASSWORD from the environment."
    )
    args = parser.parse_args()
    password = os.environ.get("DASTAK_DEMO_PASSWORD") if args.roles else None
    if args.roles and not password:
        parser.error("--roles requires DASTAK_DEMO_PASSWORD in the environment.")
    try:
        with httpx.Client(
            base_url=args.base_url.rstrip("/"), timeout=15, follow_redirects=False
        ) as client:
            report = check(client, password, args.origin)
    except (httpx.HTTPError, ValueError):
        report = {"passed": False, "error": "API connection or response failed."}
    print(json.dumps(report))
    if not report["passed"]:
        raise SystemExit(1)


if __name__ == "__main__":
    main()
