"""Container self-check of the real startup command, using isolated synthetic storage."""

import json
import os
import subprocess
import sys
import tempfile
import time
from pathlib import Path

import httpx


def main():
    with tempfile.TemporaryDirectory(prefix="dastak-startup-") as directory:
        root = Path(directory)
        environment = {
            key: value
            for key, value in os.environ.items()
            if not key.startswith(("DASTAK_", "GEMINI_"))
        }
        environment.update(
            {
                "DASTAK_ENVIRONMENT": "development",
                "DASTAK_STORAGE_BACKEND": "local",
                "DASTAK_DATABASE_URL": "sqlite:///" + (root / "test.db").as_posix(),
                "DASTAK_EVIDENCE_DIR": str(root / "evidence"),
                "DASTAK_JWT_SECRET": "isolated-container-startup-test-secret",
                "DASTAK_DEMO_PASSWORD": "synthetic-startup-password",
                "DASTAK_SEED_DEMO": "true",
                "PORT": "10000",
            }
        )
        process = subprocess.Popen(
            [sys.executable, "-m", "app.deploy"],
            env=environment,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
        )
        try:
            with httpx.Client(
                base_url="http://127.0.0.1:10000", timeout=2, trust_env=False
            ) as client:
                for _ in range(60):
                    if process.poll() is not None:
                        raise RuntimeError("Startup process exited before becoming ready")
                    try:
                        ready = client.get("/api/v1/health/ready")
                        if ready.status_code == 200:
                            break
                    except httpx.HTTPError:
                        pass
                    time.sleep(0.5)
                else:
                    raise RuntimeError("Startup process did not become ready")
                assert ready.json() == {"status": "ok", "simulated": True}
                login = client.post(
                    "/api/v1/auth/login",
                    json={"user_id": "demo-admin", "password": "synthetic-startup-password"},
                )
                assert login.status_code == 200
                me = client.get(
                    "/api/v1/auth/me",
                    headers={"Authorization": "Bearer " + login.json()["access_token"]},
                )
                assert me.status_code == 200 and me.json()["role"] == "Admin"
                print(
                    json.dumps({"startup": "ok", "port": 10000, "migrations": "ok", "seed": "ok"})
                )
        finally:
            process.terminate()
            try:
                process.wait(timeout=10)
            except subprocess.TimeoutExpired:
                process.kill()
                process.wait(timeout=5)


if __name__ == "__main__":
    main()
