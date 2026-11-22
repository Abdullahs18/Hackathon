import hashlib
import subprocess
from concurrent.futures import ThreadPoolExecutor
from io import BytesIO

import pytest
from alembic import command
from alembic.config import Config
from fastapi import HTTPException
from PIL import Image
from pypdf import PdfWriter
from pypdf.generic import ArrayObject, DictionaryObject, NameObject, TextStringObject
from sqlalchemy import select
from sqlalchemy.exc import OperationalError
from sqlalchemy.orm import Session

from app.evidence_validation import EvidenceValidator
from app.models import Complaint, Evidence
from tests.conftest import BACKEND
from tests.test_cases import (
    assign,
    case,
    case_factory,
    give_consent,
    give_helper,
    make_routing_rule,
    owner,
)
from tests.test_contract import assert_response

__all__ = ["case", "case_factory", "owner"]


def image_bytes(kind="PNG"):
    output = BytesIO()
    Image.new("RGB", (8, 8), color="red").save(output, format=kind)
    return output.getvalue()


def pdf_bytes(mode=None):
    writer = PdfWriter()
    writer.add_blank_page(width=100, height=100)
    if mode == "javascript":
        writer.root_object[NameObject("/OpenAction")] = DictionaryObject(
            {
                NameObject("/S"): NameObject("/JavaScript"),
                NameObject("/JS"): TextStringObject("app.alert('synthetic')"),
            }
        )
    elif mode == "encrypted":
        writer.encrypt("synthetic")
    elif mode == "attachment":
        writer.add_attachment("demo.txt", b"synthetic")
    output = BytesIO()
    writer.write(output)
    return output.getvalue()


def upload(client, headers, case, data=None, name="receipt.png", kind="image/png"):
    return client.post(
        f"/api/v1/complaints/{case['complaint_id']}/evidence",
        headers=headers,
        files={"file": (name, image_bytes() if data is None else data, kind)},
    )


@pytest.mark.parametrize(
    "fmt,name,mime",
    [
        ("PNG", "receipt.png", "image/png"),
        ("JPEG", "receipt.jpg", "image/jpeg"),
        ("WEBP", "receipt.webp", "image/webp"),
        ("PDF", "receipt.pdf", "application/pdf"),
    ],
)
def test_original_roundtrip(client, owner, case, app, fmt, name, mime):
    data = pdf_bytes() if fmt == "PDF" else image_bytes(fmt)
    response = upload(client, owner, case, data, name, mime)
    assert response.status_code == 201, response.text
    assert_response(response, "/api/v1/complaints/{id}/evidence", "post")
    evidence = response.json()
    assert evidence["sha256"] == hashlib.sha256(data).hexdigest()
    assert evidence["verification_status"] == "not_authenticity_verified"
    assert response.headers["x-complaint-version"] == "2"
    path = f"/api/v1/complaints/{case['complaint_id']}/evidence"
    assert client.get(path, headers=owner).json() == [evidence]
    assert_response(client.get(path, headers=owner), "/api/v1/complaints/{id}/evidence", "get")
    item = f"{path}/{evidence['evidence_id']}"
    assert_response(
        client.get(item, headers=owner), "/api/v1/complaints/{id}/evidence/{evidence_id}", "get"
    )
    download = client.get(f"{item}/content", headers=owner)
    assert download.content == data
    assert download.headers["x-evidence-sha256"] == evidence["sha256"]
    assert download.headers["cache-control"] == "no-store"
    assert "attachment" in download.headers["content-disposition"]
    assert list(app.state.evidence_store.root.glob("*.blob"))


@pytest.mark.parametrize(
    "data,name,mime",
    [
        (b"", "a.png", "image/png"),
        (b"not an image", "a.png", "image/png"),
        (image_bytes(), "a.pdf", "application/pdf"),
        (image_bytes(), "a.png", "text/html"),
        (image_bytes(), "a.svg", "image/svg+xml"),
        (pdf_bytes("javascript"), "a.pdf", "application/pdf"),
        (pdf_bytes("encrypted"), "a.pdf", "application/pdf"),
        (pdf_bytes("attachment"), "a.pdf", "application/pdf"),
    ],
)
def test_invalid_files_rejected(client, owner, case, app, data, name, mime):
    response = upload(client, owner, case, data, name, mime)
    assert response.status_code == 400, response.text
    assert not list(app.state.evidence_store.root.glob("*.blob"))


def test_retry_version_and_server_managed_ids(client, owner, case):
    headers = {**owner, "Idempotency-Key": "receipt-1", "If-Match": '"1"'}
    first = upload(client, headers, case)
    assert first.status_code == 201
    replay = upload(client, headers, case)
    assert replay.status_code == 200 and replay.json() == first.json()
    assert (
        upload(client, headers, case, image_bytes("JPEG"), "other.jpg", "image/jpeg").status_code
        == 409
    )
    assert upload(client, {**owner, "If-Match": '"1"'}, case).status_code == 412
    path = f"/api/v1/complaints/{case['complaint_id']}"
    ids = [first.json()["evidence_id"]]
    assert client.get(path, headers=owner).json()["incident_data"]["evidence_ids"] == ids
    for value in [None, [], ["invented"]]:
        assert client.patch(path, headers=owner, json={"evidence_ids": value}).status_code == 400
    assert (
        client.patch(path, headers=owner, json={"evidence_ids": ids, "amount": 1700}).status_code
        == 200
    )


def test_access_checks_and_withdrawal(client, auth, owner, case):
    item = upload(client, owner, case).json()
    root = f"/api/v1/complaints/{case['complaint_id']}/evidence"
    paths = [root, f"{root}/{item['evidence_id']}", f"{root}/{item['evidence_id']}/content"]
    for user in ["demo-admin", "demo-citizen-2", "demo-helper", "demo-officer-financial"]:
        for path in paths:
            assert client.get(path, headers=auth(user)).status_code == 403
        assert upload(client, auth(user), case).status_code == 403
    give_helper(client, owner, case["complaint_id"])
    consent = give_consent(client, owner, case["complaint_id"], ["case_status", "evidence"])
    helper = auth("demo-helper")
    for path in paths:
        assert client.get(path, headers=helper).status_code == 200
    assert upload(client, helper, case).status_code == 201
    revoked = client.post(
        f"/api/v1/consents/{consent['consent_id']}/withdraw",
        headers=owner,
    )
    assert revoked.status_code == 200, revoked.text
    for path in paths:
        assert client.get(path, headers=helper).status_code == 403
    assert upload(client, helper, case).status_code == 403


def test_wrong_parent_and_corruption(client, owner, case, case_factory, app):
    item = upload(client, owner, case).json()
    other = case_factory()
    path = f"/api/v1/complaints/{other['complaint_id']}/evidence/{item['evidence_id']}"
    assert client.get(path, headers=owner).status_code == 404
    assert client.get(f"{path}/content", headers=owner).status_code == 404
    with Session(app.state.engine) as session:
        record = session.scalar(select(Evidence))
        target = app.state.evidence_store.path(record.storage_key)
    target.write_bytes(b"corrupt")
    download = f"/api/v1/complaints/{case['complaint_id']}/evidence/{item['evidence_id']}/content"
    assert client.get(download, headers=owner).status_code == 503
    target.unlink()
    assert client.get(download, headers=owner).status_code == 503


def test_request_and_file_size_bounds(client, owner, case, app):
    app.state.settings.evidence_max_bytes = 1024
    assert upload(client, owner, case, b"a" * 1025).status_code == 413
    path = f"/api/v1/complaints/{case['complaint_id']}/evidence"
    response = client.post(path, headers={**owner, "Content-Length": "999999999"}, content=b"x")
    assert response.status_code == 413
    response = client.post(
        path,
        headers=owner,
        files=[
            ("file", ("a.png", image_bytes(), "image/png")),
            ("file", ("b.png", image_bytes(), "image/png")),
        ],
    )
    assert response.status_code == 400


def test_commit_acknowledgement_loss_preserves_original(client, owner, case, monkeypatch, app):
    original = Session.commit

    def uncertain(session):
        has_evidence = any(isinstance(item, Evidence) for item in session.identity_map.values())
        original(session)
        if has_evidence:
            raise OperationalError("synthetic acknowledgement loss", {}, None)

    with monkeypatch.context() as patch:
        patch.setattr(Session, "commit", uncertain)
        result = upload(client, {**owner, "Idempotency-Key": "uncertain"}, case)
        assert result.status_code == 503
    retry = upload(client, {**owner, "Idempotency-Key": "uncertain"}, case)
    assert retry.status_code == 200
    assert len(list(app.state.evidence_store.root.glob("*.blob"))) == 1


def test_officer_requires_assignment_workspace_and_current_evidence_scope(
    client, auth, owner, case, app
):
    rule = make_routing_rule(client, auth)
    item = upload(client, owner, case).json()
    path = f"/api/v1/complaints/{case['complaint_id']}/evidence/{item['evidence_id']}/content"
    with Session(app.state.engine) as session, session.begin():
        row = session.get(Complaint, case["complaint_id"])
        row.current_status = "SUBMITTED"
        row.destination_workspace_id = "mock-financial-fraud"
        row.rule_version_id = rule["rule_version_id"]
    consent = give_consent(
        client,
        owner,
        case["complaint_id"],
        ["case_status", "evidence"],
        "workspace:mock-financial-fraud",
        "complaint_submission",
    )
    officer = auth("demo-officer-financial")
    assert client.get(path, headers=officer).status_code == 403
    assert assign(client, auth, case["complaint_id"]).status_code == 200
    assert client.get(path, headers=officer).status_code == 200
    assert client.get(path, headers=auth("demo-officer-digital")).status_code == 403
    assert upload(client, officer, case).status_code == 403
    assert upload(client, owner, case).status_code == 409
    assert (
        client.post(f"/api/v1/consents/{consent['consent_id']}/withdraw", headers=owner).status_code
        == 200
    )
    assert client.get(path, headers=officer).status_code == 403


def test_flush_failure_cleans_only_new_file(client, owner, case, monkeypatch, app):
    original = Session.flush

    def fail(session, *args, **kwargs):
        if any(isinstance(item, Evidence) for item in session.new):
            raise OperationalError("synthetic flush failure", {}, None)
        return original(session, *args, **kwargs)

    with monkeypatch.context() as patch:
        patch.setattr(Session, "flush", fail)
        assert upload(client, owner, case).status_code == 503
    assert not list(app.state.evidence_store.root.glob("*.blob"))
    assert (
        client.get(f"/api/v1/complaints/{case['complaint_id']}/evidence", headers=owner).json()
        == []
    )


def test_validator_timeout_and_busy_are_bounded(monkeypatch):
    validator = EvidenceValidator()

    def timeout(*args, **kwargs):
        raise subprocess.TimeoutExpired("synthetic", 5)

    monkeypatch.setattr(subprocess, "run", timeout)
    with pytest.raises(HTTPException) as result:
        validator.validate(image_bytes(), "a.png", "image/png")
    assert result.value.status_code == 400
    validator.capacity.acquire()
    validator.capacity.acquire()
    with pytest.raises(HTTPException) as result:
        validator.validate(image_bytes(), "a.png", "image/png")
    assert result.value.status_code == 429


def test_chunked_request_limit(client, owner, case):
    def chunks():
        for _ in range(12):
            yield b"x" * (1024 * 1024)

    response = client.post(
        f"/api/v1/complaints/{case['complaint_id']}/evidence", headers=owner, content=chunks()
    )
    assert response.status_code == 413


def test_upgrade_keeps_case_grants_consent_and_original_account(client, owner, case, app):
    give_helper(client, owner, case["complaint_id"])
    consent = give_consent(client, owner, case["complaint_id"], ["case_status", "evidence"])
    path = f"/api/v1/complaints/{case['complaint_id']}"
    before = client.get(path, headers=owner).json()
    config = Config(str(BACKEND / "alembic.ini"))
    command.downgrade(config, "0002")
    assert client.get("/api/v1/health/ready").status_code == 503
    command.upgrade(config, "head")
    assert client.get("/api/v1/health/ready").status_code == 200
    assert client.get(path, headers=owner).json() == before
    assert client.get(f"{path}/helper-grants", headers=owner).json()[0]["active"]
    assert client.get(f"{path}/consents", headers=owner).json() == [consent]


def test_postgres_concurrent_upload_retry(client, owner, case, app):
    if app.state.engine.dialect.name != "postgresql":
        pytest.skip("PostgreSQL row-lock concurrency check")
    headers = {**owner, "Idempotency-Key": "parallel-receipt"}
    with ThreadPoolExecutor(max_workers=2) as pool:
        responses = list(pool.map(lambda _: upload(client, headers, case), range(2)))
    assert sorted(response.status_code for response in responses) == [200, 201]
    assert responses[0].json() == responses[1].json()
    assert len(list(app.state.evidence_store.root.glob("*.blob"))) == 1


def test_private_store_unavailable_and_safe_paths(client, owner, case, app):
    store = app.state.evidence_store
    store.root.parent.mkdir(parents=True, exist_ok=True)
    store.root.write_bytes(b"synthetic obstruction")
    result = upload(client, owner, case)
    assert result.status_code == 503
    assert str(store.root) not in result.text
    assert client.get("/api/v1/health/ready").status_code == 503
    with pytest.raises(HTTPException):
        store.path("../../outside")


def test_pdf_external_actions_are_not_static(client, owner, case):
    writer = PdfWriter()
    page = writer.add_blank_page(width=100, height=100)
    page[NameObject("/Annots")] = ArrayObject(
        [
            DictionaryObject(
                {
                    NameObject("/Type"): NameObject("/Annot"),
                    NameObject("/Subtype"): NameObject("/Link"),
                    NameObject("/A"): DictionaryObject(
                        {
                            NameObject("/S"): NameObject("/GoToE"),
                            NameObject("/F"): TextStringObject("external.pdf"),
                        }
                    ),
                }
            )
        ]
    )
    output = BytesIO()
    writer.write(output)
    assert (
        upload(client, owner, case, output.getvalue(), "action.pdf", "application/pdf").status_code
        == 400
    )
