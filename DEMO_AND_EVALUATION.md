# Dastak: full-role demo and quality checks

Use synthetic accounts and reports. All destinations, identity checks, payment lookups and receipts in this prototype are simulated. Gemini extracts and classifies reported information; it does not establish guilt. The citizen controls facts, sharing and filing; the Officer controls the case outcome.

## Update and release checks

On `integration/fe-be`, preserve your existing `.env`, then:

```powershell
git pull origin integration/fe-be
docker compose up --build -d
docker compose run --rm api python -m app.seed
docker compose exec api python -m app.release_check
docker compose ps -a
```

Migration `0010_review_help` adds durable human-help requests without changing existing complaints. The seed preserves existing passwords. For role login checks, `DASTAK_DEMO_PASSWORD` must match your existing seeded password inside the container:

```powershell
docker compose exec api python -m app.release_check --roles
```

This command checks health, database readiness, the new API operations and all five operational accounts. It does not create cases or call Gemini. Open the frontend normally and confirm its API URL points at this backend. Keep `/api/v1/health/ready` in the deployment health check; the existing request IDs and safe status logs support troubleshooting without logging citizen statements.

## Main demonstration

1. **Citizen (`demo-citizen-1`)**: explain a synthetic fake aid message by text or Urdu recording. State 1500 PKR and leave the date unknown. Voice input requires explicit provider permission.
2. Analyze the report. For text input, the AI suggestions panel offers missing facts. Show that existing answers are not selected for replacement. Check the proposed facts, explicitly confirm and apply them, then analyze the saved form again.
3. Open review. Show the prepared complaint form, unknown date and downloadable copy. Correct a field and show that the prepared copy must refresh before approval. Generate Urdu review audio with speech permission.
4. Review the required recipients and grant them together. Helper and voice permissions remain separate optional choices. Explicitly authorize final filing.
5. Show the assistant's saved identity, payment, reporting requirements, submission and receipt-verification steps. Unknown payment references produce a skipped payment check. Each displayed result comes from a durable backend tool checkpoint. Read back the confirmed `SIM-` reference.
6. **Admin (`demo-admin`)**: find the submitted case in the assignment queue and choose a matching financial Officer. The Admin queue exposes assignment metadata rather than the citizen statement.
7. **Officer (`demo-officer-financial`)**: open the assigned case, request clarification, and show the Citizen's answer returning. Accept and resolve using the actual available workflow actions. Try the digital Officer to show workspace isolation.

Useful AI work is visible at four points: Urdu transcription, structured fact extraction that fills selected form fields, classification and follow-up questions, and Urdu spoken review. LangGraph coordinates the approved tool workflow with persisted checkpoints and receipt recovery. Routing and authority boundaries remain deterministic.

## Human-help and recovery demonstration

Create a contradictory synthetic report (no money lost, but a positive amount). Analyze it and show the stopped status. It has not been submitted or automatically assigned to a human.

The Citizen selects an active Helper and explicitly shares the listed incident fields. The saved request shows **waiting**. Sign in as `demo-helper`, acknowledge the request and send a clarification note. The Citizen sees the saved response and decides which facts to correct before analyzing again. Notes never amend the citizen's statement, approve filing or resolve the complaint.

Withdraw Helper consent from the Citizen's sharing settings and retry from the Helper: further reads and actions are denied. Replaying the old request key does not restore withdrawn access. Review requests exclude private voice files, evidence and correction history. Requesting review replaces that Helper's prior field selection with the fields listed in the panel.

Also demonstrate a network interruption while editing, reconnect and recover local edits. Interrupt a submission response, then use receipt recovery with the preserved request key rather than creating another filing. The regression suite covers these recovery paths.

## Gemini quality evaluation

The separately stored `backend/evaluation/cases.jsonl` contains **36 synthetic labelled cases**, twelve scenarios each in English, Urdu and Roman Urdu. Gold fields include amounts, currency, loss flags, known/unknown dates and exact references. Cases cover no-loss phishing, impersonation, fraudulent transfers, unknown facts, out-of-scope requests, hostile instructions inside scam text, contradictions, duplicate-review flags and leading-zero references.

Validate the dataset without any provider calls:

```powershell
docker compose exec api python -m app.evaluation
```

Run against your configured Gemini key/model:

```powershell
docker compose exec api python -m app.evaluation --live --allow-external-processing --output /tmp/dastak-evaluation.json
docker compose cp api:/tmp/dastak-evaluation.json ./dastak-evaluation.json
```

The report records the model, individual outputs, exact critical-field agreement, preserved unknowns, classification and expected-handling agreement, timings and safe provider error codes. Leading zeros must survive exactly. Missing output keys do not count as preserved unknowns. Provider errors are counted separately and cause a failing exit code. Confidence scores are not used as accuracy measurements. Paraphrased narrative text is deliberately not compared using exact string matching. Handling applies the existing readiness policy to unconfirmed extracted facts with a synthetic matching-route assumption for supported classifications; it does not file a case. Duplicate cases provide a labelled duplicate flag to that policy, rather than testing database similarity detection.

For additional audio evaluation, copy a synthetic recording into a dataset directory and add `audio_file` to its JSONL row, relative to that directory. Keep `text` as the exact reference transcript and keep the same gold fields. The live command then transcribes the recording, assesses the transcript and records word error rate as well as extraction metrics. Audio paths cannot escape the dataset directory, and the usual 5 MiB/60-second validation applies. Text-only cases never synthesize or upload audio.

Model selection: a configurable Gemini model combines regional-language interpretation and schema-constrained extraction. Bounded requests, strict output validation, no automatic retries and citizen confirmation limit accidental invention and uncontrolled cost. Use the same evaluation set when changing the model. The existing voice demo separately exercises actual transcription, extraction and spoken review; run it with your own synthetic Urdu recording as well as the generated sample.

Authentic source documents and RAG remain a separate data workstream: verify ownership, provenance, currency, permissible reuse and reporting jurisdiction before indexing. Retrieval must cite source passages and keep simulated routing separate from official guidance. This change does not commit an unverified corpus.

## Short usability check

Ask two or three people unfamiliar with the app to complete the main citizen path and one recovery task, including an Urdu-first participant. Observe without coaching. Record actual results:

| Participant alias | Language | Task | Time | Completion | Errors / help needed | Suggested change |
| --- | --- | --- | --- | --- | --- | --- |
| | | Explain → review → submit | | | | |
| | | Find status / understand next action | | | | |
| | | Recover a disconnected draft | | | | |

Compare the time and mistakes against manually preparing the same synthetic report. Ask participants what they believe was shared, whether a real authority received anything, and who makes the final decision. Record misunderstandings and fix the wording before the presentation.
