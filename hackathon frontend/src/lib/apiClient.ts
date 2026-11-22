import { DastakApiError } from '@/lib/apiError';
import {
  getMockEvidenceRecord,
  isMockOfflineSimulated,
  mockApi,
  resetMockDb,
  setMockOfflineSimulated,
} from '@/lib/mockApi';
import type {
  AgentRunRecord,
  AdminAssignmentQueue,
  ReviewHelpInbox,
  ReviewHelpRecord,
  CitizenAgentProgress,
  AgentRunSummary,
  AnalysisResponse,
  ApiErrorBody,
  ApiKeyCreate,
  ApiKeyIssued,
  ApiKeyMetadata,
  AuditLogRecord,
  AuthorizeSubmission,
  ClientEvidencePreview,
  ComplaintRecord,
  ConsentChange,
  ConsentGrant,
  ConsentRecord,
  EvidenceRecord,
  HelperInformation,
  IncidentInformation,
  IncidentPatch,
  LoginRequest,
  LoginResult,
  MockIdentityRecord,
  MockPaymentTransaction,
  MockReportingRequirements,
  NotificationRecord,
  OfficerDecision,
  RoutingRuleRecord,
  RoutingRuleVersionRecord,
  RuleChange,
  RuleCreate,
  SubmissionConfirmation,
  SubmissionRequest,
  UserCreate,
  UserRecord,
  VoiceInput,
  SpeechRequest,
  SpeechOutput,
  SubmissionExecution,
  ReviewEvent,
} from '@/types/dastak';

export { DastakApiError, isDastakApiError } from '@/lib/apiError';

export const USE_MOCK = import.meta.env.VITE_USE_MOCK === 'true';
export const API_BASE_URL = (
  import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000'
).replace(/\/$/, '');

const TOKEN_KEY = 'dastak_access_token';
const EVIDENCE_CACHE_KEY = 'dastak_client_evidence_cache';

type UnauthorizedListener = (reason?: string) => void;
const unauthorizedListeners = new Set<UnauthorizedListener>();

export function onUnauthorized(listener: UnauthorizedListener): () => void {
  unauthorizedListeners.add(listener);
  return () => {
    unauthorizedListeners.delete(listener);
  };
}

function notifyUnauthorized(reason?: string): void {
  clearAuthToken();
  try { sessionStorage.removeItem(EVIDENCE_CACHE_KEY); } catch { /* Storage may be unavailable. */ }
  for (const listener of unauthorizedListeners) {
    listener(reason);
  }
}

export function getAuthToken(): string | null {
  try {
    return sessionStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export function setAuthToken(token: string): void {
  try {
    sessionStorage.setItem(TOKEN_KEY, token);
  } catch {
    // ignore storage limits
  }
}

export function clearAuthToken(): void {
  try {
    sessionStorage.removeItem(TOKEN_KEY);
  } catch {
    // ignore
  }
}

export function isSimulatedOffline(): boolean {
  return USE_MOCK && isMockOfflineSimulated();
}

export function setSimulatedOffline(offline: boolean): void {
  if (!USE_MOCK) return;
  setMockOfflineSimulated(offline);
}

export function resetDemoState(): void {
  if (USE_MOCK) {
    resetMockDb();
    setMockOfflineSimulated(false);
  }
  try {
    sessionStorage.removeItem(EVIDENCE_CACHE_KEY);
  } catch {
    // ignore
  }
}

function cacheEvidencePreview(entry: ClientEvidencePreview): void {
  try {
    const raw = sessionStorage.getItem(EVIDENCE_CACHE_KEY);
    const map: Record<string, ClientEvidencePreview> = raw
      ? (JSON.parse(raw) as Record<string, ClientEvidencePreview>)
      : {};
    map[entry.evidence.evidence_id] = entry;
    sessionStorage.setItem(EVIDENCE_CACHE_KEY, JSON.stringify(map));
  } catch {
    // ignore sessionStorage quota failures on large images
  }
}

export function getCachedEvidence(
  evidenceId: string,
): ClientEvidencePreview | null {
  try {
    const raw = sessionStorage.getItem(EVIDENCE_CACHE_KEY);
    if (raw) {
      const map = JSON.parse(raw) as Record<string, ClientEvidencePreview>;
      if (map[evidenceId]) return map[evidenceId];
    }
  } catch {
    // ignore
  }
  if (USE_MOCK) {
    return getMockEvidenceRecord(evidenceId);
  }
  return null;
}

export function generateIdempotencyKey(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `idem_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

async function parseErrorResponse(res: Response): Promise<DastakApiError> {
  let errorCode = `http_${res.status}`;
  let detail = res.statusText || `Request failed with status ${res.status}`;
  let validationErrors: string[] | undefined;

  try {
    const contentType = res.headers.get('content-type') || '';
    if (contentType.includes('application/json')) {
      const body = (await res.json()) as
        | Partial<ApiErrorBody>
        | { detail?: string | Array<{ loc?: unknown[]; msg?: string }> };

      if ('error' in body && typeof body.error === 'string') {
        errorCode = body.error;
      }
      if (typeof body.detail === 'string') {
        detail = body.detail;
      } else if (Array.isArray(body.detail)) {
        validationErrors = body.detail.map((item) => {
          const loc = Array.isArray(item.loc) ? item.loc.join('.') : 'field';
          return `${loc}: ${item.msg ?? 'invalid value'}`;
        });
        detail = validationErrors.join('; ') || 'Validation error (422).';
        errorCode = 'validation_error';
      }
    } else {
      const text = await res.text();
      if (text) detail = text;
    }
  } catch {
    // keep fallback message
  }

  return new DastakApiError(res.status, errorCode, detail, validationErrors);
}

interface FetchOptions {
  method?: 'GET' | 'POST' | 'PATCH';
  body?: unknown;
  formData?: FormData;
  idempotencyKey?: string;
  skipAuth?: boolean;
  ifMatch?: number | string;
  onResponse?: (response: Response) => void;
}

async function fetchJson<T>(path: string, opts: FetchOptions = {}): Promise<T> {
  const method = opts.method ?? 'GET';
  const url = `${API_BASE_URL}${path}`;
  const headers: Record<string, string> = {};

  if (!opts.skipAuth) {
    const token = getAuthToken();
    if (token) {
      headers.Authorization = `Bearer ${token}`;
    }
  }

  if (opts.idempotencyKey) {
    headers['Idempotency-Key'] = opts.idempotencyKey;
  }
  if (opts.ifMatch !== undefined) {
    headers['If-Match'] = `"${opts.ifMatch}"`;
  }

  let bodyInit: BodyInit | undefined;
  if (opts.formData) {
    bodyInit = opts.formData;
  } else if (opts.body !== undefined) {
    headers['Content-Type'] = 'application/json';
    bodyInit = JSON.stringify(opts.body);
  }

  const maxAttempts = method === 'GET' ? 2 : 1;
  let lastError: DastakApiError | null = null;

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    try {
      const res = await fetch(url, {
        method,
        headers,
        body: bodyInit,
      });

      if (res.ok) {
        opts.onResponse?.(res);
        return (await res.json()) as T;
      }

      const apiErr = await parseErrorResponse(res);
      if (res.status === 401 && !opts.skipAuth) {
        notifyUnauthorized(apiErr.detail);
      }

      if (
        method === 'GET' &&
        (res.status === 502 || res.status === 503 || res.status === 504) &&
        attempt + 1 < maxAttempts
      ) {
        lastError = apiErr;
        await new Promise((r) => setTimeout(r, 350));
        continue;
      }

      throw apiErr;
    } catch (err) {
      if (err instanceof DastakApiError) {
        throw err;
      }
      lastError = new DastakApiError(
        0,
        'NETWORK_ERROR',
        'Network connection failed or server unreachable. Local draft changes remain safe on this device.',
      );
      if (method === 'GET' && attempt + 1 < maxAttempts) {
        await new Promise((r) => setTimeout(r, 350));
        continue;
      }
      throw lastError;
    }
  }

  throw (
    lastError ??
    new DastakApiError(0, 'NETWORK_ERROR', 'Unexpected network failure.')
  );
}

function savedVersion(version: number | undefined): number {
  if (!Number.isSafeInteger(version) || !version || version < 1) {
    throw new DastakApiError(409, 'review_required', 'Reload and review the current saved case before continuing.');
  }
  return version;
}

async function fetchPages<T>(path: string): Promise<T[]> {
  const result: T[] = [];
  const seen = new Set<string>();
  let cursor = '';
  do {
    let next = '';
    const query = new URLSearchParams({limit: '100'});
    if (cursor) query.set('before', cursor);
    const rows = await fetchJson<T[]>(`${path}?${query}`, {onResponse: r => { next = r.headers.get('X-Next-Cursor') || ''; }});
    result.push(...rows);
    if (next && seen.has(next)) throw new DastakApiError(503, 'pagination_failed', 'Could not recover the next result page.');
    if (next) seen.add(next);
    cursor = next;
  } while (cursor);
  return result;
}

async function fetchPrivateBlob(path: string): Promise<Blob> {
  if (!path.startsWith('/api/v1/')) throw new DastakApiError(400, 'invalid_path', 'Invalid private file path.');
  const token = getAuthToken();
  let res: Response;
  try {
    res = await fetch(`${API_BASE_URL}${path}`, {headers: token ? {Authorization: `Bearer ${token}`} : {}});
  } catch {
    throw new DastakApiError(0, 'NETWORK_ERROR', 'Private file download failed. Please retry.');
  }
  if (!res.ok) {
    const error = await parseErrorResponse(res);
    if (res.status === 401) notifyUnauthorized(error.detail);
    throw error;
  }
  return res.blob();
}

function readImagePreview(file: File): Promise<string | undefined> {
  return new Promise((resolve) => {
    if (!file.type.startsWith('image/') || file.size > 1_200_000) {
      resolve(undefined);
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      resolve(typeof reader.result === 'string' ? reader.result : undefined);
    };
    reader.onerror = () => resolve(undefined);
    reader.readAsDataURL(file);
  });
}

async function runMockWithAuthCheck<T>(fn: (token: string | null) => Promise<T>): Promise<T> {
  try {
    return await fn(getAuthToken());
  } catch (err) {
    if (err instanceof DastakApiError && err.status === 401) {
      notifyUnauthorized(err.detail);
    }
    throw err;
  }
}

export const dastakApi = {
  async login(payload: LoginRequest): Promise<LoginResult> {
    const result = USE_MOCK
      ? await mockApi.login(payload)
      : await fetchJson<LoginResult>('/api/v1/auth/login', {
          method: 'POST',
          body: payload,
          skipAuth: true,
        });
    setAuthToken(result.access_token);
    return result;
  },

  async getMe(): Promise<UserRecord> {
    if (USE_MOCK) {
      return runMockWithAuthCheck((token) => mockApi.getMe(token));
    }
    return fetchJson<UserRecord>('/api/v1/auth/me');
  },

  logout(): void {
    clearAuthToken();
    try { sessionStorage.removeItem(EVIDENCE_CACHE_KEY); } catch { /* Storage may be unavailable. */ }
  },

  async createComplaint(
    payload: IncidentInformation,
    idempotencyKey?: string,
  ): Promise<ComplaintRecord> {
    const key = idempotencyKey || generateIdempotencyKey();
    if (USE_MOCK) {
      return runMockWithAuthCheck((token) =>
        mockApi.createComplaint(token, payload),
      );
    }
    return fetchJson<ComplaintRecord>('/api/v1/complaints', {
      method: 'POST',
      body: payload,
      idempotencyKey: key,
    });
  },

  async listComplaints(): Promise<ComplaintRecord[]> {
    if (USE_MOCK) {
      return runMockWithAuthCheck((token) => mockApi.listComplaints(token));
    }
    return fetchJson<ComplaintRecord[]>('/api/v1/complaints');
  },

  async getComplaint(id: string): Promise<ComplaintRecord> {
    if (USE_MOCK) {
      return runMockWithAuthCheck((token) => mockApi.getComplaint(token, id));
    }
    return fetchJson<ComplaintRecord>(
      `/api/v1/complaints/${encodeURIComponent(id)}`,
    );
  },

  async updateComplaint(
    id: string,
    patch: IncidentPatch,
    version: number | undefined,
  ): Promise<ComplaintRecord> {
    if (USE_MOCK) {
      return runMockWithAuthCheck((token) =>
        mockApi.updateComplaint(token, id, patch),
      );
    }
    return fetchJson<ComplaintRecord>(
      `/api/v1/complaints/${encodeURIComponent(id)}`,
      {
        method: 'PATCH',
        body: patch,
        ifMatch: savedVersion(version),
      },
    );
  },

  async uploadEvidence(
    complaintId: string,
    file: File,
    idempotencyKey?: string,
  ): Promise<EvidenceRecord> {
    const key = idempotencyKey || generateIdempotencyKey();
    if (USE_MOCK) {
      const res = await runMockWithAuthCheck((token) =>
        mockApi.uploadEvidence(token, complaintId, file),
      );
      cacheEvidencePreview(res);
      return res.evidence;
    }

    const formData = new FormData();
    formData.append('file', file);
    const evidence = await fetchJson<EvidenceRecord>(
      `/api/v1/complaints/${encodeURIComponent(complaintId)}/evidence`,
      {
        method: 'POST',
        formData,
        idempotencyKey: key,
      },
    );
    const preview_data_url = await readImagePreview(file);
    cacheEvidencePreview({ evidence, preview_data_url });
    return evidence;
  },

  async analyzeComplaint(id: string, allowExternalProcessing: boolean): Promise<AnalysisResponse> {
    if (!allowExternalProcessing) throw new DastakApiError(400, 'permission_required', 'Permit Gemini processing before analyzing this case.');
    if (USE_MOCK) {
      return runMockWithAuthCheck((token) =>
        mockApi.analyzeComplaint(token, id),
      );
    }
    return fetchJson<AnalysisResponse>(
      `/api/v1/complaints/${encodeURIComponent(id)}/analyze`,
      {
        method: 'POST',
        body: {allow_external_processing: true},
      },
    );
  },

  async authorizeSubmission(
    id: string,
    payload: AuthorizeSubmission,
    idempotencyKey: string,
  ): Promise<ComplaintRecord> {
    if (USE_MOCK) {
      return runMockWithAuthCheck((token) =>
        mockApi.authorizeSubmission(token, id, payload, idempotencyKey),
      );
    }
    return fetchJson<ComplaintRecord>(
      `/api/v1/complaints/${encodeURIComponent(id)}/authorize-submission`,
      {
        method: 'POST',
        body: payload,
        idempotencyKey,
      },
    );
  },

  async listConsents(complaintId: string): Promise<ConsentRecord[]> {
    if (USE_MOCK) {
      return runMockWithAuthCheck((token) =>
        mockApi.listConsents(token, complaintId),
      );
    }
    return fetchJson<ConsentRecord[]>(
      `/api/v1/complaints/${encodeURIComponent(complaintId)}/consents`,
    );
  },

  async grantConsent(
    complaintId: string,
    payload: ConsentGrant,
  ): Promise<ConsentRecord> {
    if (USE_MOCK) {
      return runMockWithAuthCheck((token) =>
        mockApi.grantConsent(token, complaintId, payload),
      );
    }
    return fetchJson<ConsentRecord>(
      `/api/v1/complaints/${encodeURIComponent(complaintId)}/consents`,
      {
        method: 'POST',
        body: payload,
      },
    );
  },

  async changeConsent(
    consentId: string,
    payload: ConsentChange,
  ): Promise<ConsentRecord> {
    if (USE_MOCK) {
      return runMockWithAuthCheck((token) =>
        mockApi.changeConsent(token, consentId, payload),
      );
    }
    return fetchJson<ConsentRecord>(
      `/api/v1/consents/${encodeURIComponent(consentId)}`,
      {
        method: 'PATCH',
        body: payload,
      },
    );
  },

  async withdrawConsent(consentId: string): Promise<ConsentRecord> {
    if (USE_MOCK) {
      return runMockWithAuthCheck((token) =>
        mockApi.withdrawConsent(token, consentId),
      );
    }
    return fetchJson<ConsentRecord>(
      `/api/v1/consents/${encodeURIComponent(consentId)}/withdraw`,
      {
        method: 'POST',
      },
    );
  },

  async listHelperComplaints(): Promise<ComplaintRecord[]> {
    if (USE_MOCK) {
      return runMockWithAuthCheck((token) =>
        mockApi.listHelperComplaints(token),
      );
    }
    return fetchJson<ComplaintRecord[]>('/api/v1/helper/complaints');
  },

  async addHelperInformation(
    complaintId: string,
    payload: HelperInformation,
    version: number | undefined,
  ): Promise<ComplaintRecord> {
    if (USE_MOCK) {
      return runMockWithAuthCheck((token) =>
        mockApi.addHelperInformation(token, complaintId, payload),
      );
    }
    return fetchJson<ComplaintRecord>(
      `/api/v1/complaints/${encodeURIComponent(complaintId)}/helper-information`,
      {
        method: 'POST',
        body: payload,
        ifMatch: savedVersion(version),
      },
    );
  },

  async listOfficerComplaints(): Promise<ComplaintRecord[]> {
    if (USE_MOCK) {
      return runMockWithAuthCheck((token) =>
        mockApi.listOfficerComplaints(token),
      );
    }
    return fetchJson<ComplaintRecord[]>('/api/v1/officer/complaints');
  },

  async getOfficerComplaint(id: string): Promise<ComplaintRecord> {
    if (USE_MOCK) {
      return runMockWithAuthCheck((token) =>
        mockApi.getOfficerComplaint(token, id),
      );
    }
    return fetchJson<ComplaintRecord>(
      `/api/v1/officer/complaints/${encodeURIComponent(id)}`,
    );
  },

  async takeOfficerAction(
    id: string,
    decision: OfficerDecision,
    version: number | undefined,
    commandKey: string,
  ): Promise<ComplaintRecord> {
    if (USE_MOCK) {
      return runMockWithAuthCheck((token) =>
        mockApi.takeOfficerAction(token, id, decision),
      );
    }
    return fetchJson<ComplaintRecord>(
      `/api/v1/officer/complaints/${encodeURIComponent(id)}/actions`,
      {
        method: 'POST',
        body: decision,
        ifMatch: savedVersion(version),
        idempotencyKey: commandKey,
      },
    );
  },

  async listUsers(): Promise<UserRecord[]> {
    if (USE_MOCK) {
      return runMockWithAuthCheck((token) => mockApi.listUsers(token));
    }
    return fetchJson<UserRecord[]>('/api/v1/admin/users');
  },

  async createUser(payload: UserCreate): Promise<UserRecord> {
    if (USE_MOCK) {
      return runMockWithAuthCheck((token) =>
        mockApi.createUser(token, payload),
      );
    }
    return fetchJson<UserRecord>('/api/v1/admin/users', {
      method: 'POST',
      body: payload,
    });
  },

  async listRoutingRules(): Promise<RoutingRuleRecord[]> {
    if (USE_MOCK) {
      return runMockWithAuthCheck((token) => mockApi.listRoutingRules(token));
    }
    return fetchJson<RoutingRuleRecord[]>('/api/v1/admin/routing-rules');
  },

  async listRoutingVersions(id: string): Promise<RoutingRuleVersionRecord[]> {
    return fetchJson(`/api/v1/admin/routing-rules/${encodeURIComponent(id)}/versions`);
  },

  async createRoutingRule(payload: RuleCreate): Promise<RoutingRuleRecord> {
    if (USE_MOCK) {
      return runMockWithAuthCheck((token) =>
        mockApi.createRoutingRule(token, payload),
      );
    }
    return fetchJson<RoutingRuleRecord>('/api/v1/admin/routing-rules', {
      method: 'POST',
      body: payload,
    });
  },

  async updateRoutingRule(
    id: string,
    patch: RuleChange,
    version: string,
  ): Promise<RoutingRuleRecord> {
    if (USE_MOCK) {
      return runMockWithAuthCheck((token) =>
        mockApi.updateRoutingRule(token, id, patch),
      );
    }
    return fetchJson<RoutingRuleRecord>(
      `/api/v1/admin/routing-rules/${encodeURIComponent(id)}`,
      {
        method: 'PATCH',
        body: patch,
        ifMatch:version,
      },
    );
  },

  async listAudit(): Promise<AuditLogRecord[]> {
    if (USE_MOCK) {
      return runMockWithAuthCheck((token) => mockApi.listAudit(token));
    }
    return fetchPages<AuditLogRecord>('/api/v1/admin/audit');
  },

  async listAgentRuns(): Promise<AgentRunSummary[]> {
    if (USE_MOCK) {
      const rows = await runMockWithAuthCheck((token) => mockApi.listAgentRuns(token));
      return rows.map((r: AgentRunRecord) => ({agent_run_id:r.agent_run_id, complaint_id:r.complaint_id, rule_version_id:r.rule_version_id, destination_workspace_id:r.destination_workspace_id, current_status:r.current_status, next_step:'done', submitted:r.current_status==='SUBMITTED', tools:[], outcomes:[], created_at:'', updated_at:'', redacted:true}));
    }
    return fetchPages<AgentRunSummary>('/api/v1/admin/agent-runs');
  },

  async listApiKeys(): Promise<ApiKeyMetadata[]> {
    if (USE_MOCK) {
      return runMockWithAuthCheck((token) => mockApi.listApiKeys(token));
    }
    return fetchPages<ApiKeyMetadata>('/api/v1/admin/api-keys');
  },

  async createApiKey(payload: ApiKeyCreate, commandKey: string): Promise<ApiKeyIssued> {
    if (USE_MOCK) {
      return runMockWithAuthCheck((token) =>
        mockApi.createApiKey(token, payload),
      );
    }
    return fetchJson<ApiKeyIssued>('/api/v1/admin/api-keys', {
      method: 'POST',
      body: payload,
      idempotencyKey: commandKey,
    });
  },

  async revokeApiKey(id: string): Promise<ApiKeyMetadata> {
    if (USE_MOCK) {
      return runMockWithAuthCheck((token) => mockApi.revokeApiKey(token, id));
    }
    return fetchJson<ApiKeyMetadata>(
      `/api/v1/admin/api-keys/${encodeURIComponent(id)}/revoke`,
      {
        method: 'POST',
      },
    );
  },

  async getMockIdentity(reference: string): Promise<MockIdentityRecord> {
    if (USE_MOCK) {
      return runMockWithAuthCheck((token) =>
        mockApi.getMockIdentity(token, reference),
      );
    }
    return fetchJson<MockIdentityRecord>(
      `/api/v1/mock/identity/${encodeURIComponent(reference)}`,
    );
  },

  async getMockPayment(reference: string): Promise<MockPaymentTransaction> {
    if (USE_MOCK) {
      return runMockWithAuthCheck((token) =>
        mockApi.getMockPayment(token, reference),
      );
    }
    return fetchJson<MockPaymentTransaction>(
      `/api/v1/mock/payments/transactions/${encodeURIComponent(reference)}`,
    );
  },

  async getMockRequirements(
    incidentType: string,
  ): Promise<MockReportingRequirements> {
    if (USE_MOCK) {
      return runMockWithAuthCheck((token) =>
        mockApi.getMockRequirements(token, incidentType),
      );
    }
    return fetchJson<MockReportingRequirements>(
      `/api/v1/mock/data/requirements/${encodeURIComponent(incidentType)}`,
    );
  },

  async submitMockComplaint(
    payload: SubmissionRequest,
    idempotencyKey: string,
  ): Promise<SubmissionConfirmation> {
    if (USE_MOCK) {
      return runMockWithAuthCheck((token) =>
        mockApi.submitMockComplaint(token, payload, idempotencyKey),
      );
    }
    return fetchJson<SubmissionConfirmation>('/api/v1/mock/complaints', {
      method: 'POST',
      body: payload,
      idempotencyKey,
    });
  },

  async findMockSubmission(key: string): Promise<SubmissionConfirmation> {
    if (USE_MOCK) {
      return runMockWithAuthCheck((token) =>
        mockApi.findMockSubmission(token, key),
      );
    }
    return fetchJson<SubmissionConfirmation>(
      `/api/v1/mock/complaints/by-idempotency-key/${encodeURIComponent(key)}`,
    );
  },

  async listNotifications(): Promise<NotificationRecord[]> {
    if (USE_MOCK) {
      return runMockWithAuthCheck((token) => mockApi.listNotifications(token));
    }
    return fetchPages<NotificationRecord>('/api/v1/notifications');
  },

  async readNotification(id: string): Promise<NotificationRecord> {
    if (USE_MOCK) {
      return runMockWithAuthCheck((token) =>
        mockApi.readNotification(token, id),
      );
    }
    return fetchJson<NotificationRecord>(
      `/api/v1/notifications/${encodeURIComponent(id)}/read`,
      {
        method: 'POST',
      },
    );
  },

  getCachedEvidence,
  async executeSubmission(id: string, authorizationId: string, key: string): Promise<SubmissionExecution> {
    return fetchJson(`/api/v1/complaints/${encodeURIComponent(id)}/submit`, {method:'POST', body:{authorization_id: authorizationId}, idempotencyKey:key});
  },
  async getAnalysis(id: string): Promise<AnalysisResponse> {
    return fetchJson(`/api/v1/complaints/${encodeURIComponent(id)}/analysis`);
  },
  async listVoiceInputs(id: string): Promise<VoiceInput[]> {
    return fetchPages(`/api/v1/complaints/${encodeURIComponent(id)}/voice-inputs`);
  },
  async createVoiceInput(id: string, blob: Blob, version: number | undefined, key: string): Promise<VoiceInput> {
    const formData = new FormData();
    formData.append('file', blob, 'recording');
    formData.append('allow_external_processing', 'true');
    return fetchJson(`/api/v1/complaints/${encodeURIComponent(id)}/voice-inputs`, {method:'POST', formData, ifMatch:savedVersion(version), idempotencyKey:key});
  },
  async retryVoiceInput(id: string, turn: VoiceInput, version: number | undefined): Promise<VoiceInput> {
    return fetchJson(`/api/v1/complaints/${encodeURIComponent(id)}/voice-inputs/${turn.voice_turn_id}/retry`, {method:'POST', body:{allow_external_processing:true}, ifMatch:savedVersion(version)});
  },
  async confirmVoiceInput(id: string, turn: VoiceInput, patch: IncidentPatch, transcript: string): Promise<ComplaintRecord> {
    const {evidence_ids: _evidence, citizen_confirmed_corrections: _corrections, ...incident_patch} = patch;
    const body: {citizen_confirmed:true;incident_patch:IncidentPatch;transcript_correction?:string} = {citizen_confirmed:true,incident_patch};
    if (transcript.trim() !== (turn.transcript || '').trim()) body.transcript_correction = transcript;
    return fetchJson(`/api/v1/complaints/${encodeURIComponent(id)}/voice-inputs/${turn.voice_turn_id}/confirm`, {method:'POST', ifMatch:turn.input_version, body});
  },
  async createSpeech(id: string, body: SpeechRequest, version: number | undefined, key: string): Promise<SpeechOutput> {
    return fetchJson(`/api/v1/complaints/${encodeURIComponent(id)}/speech`, {method:'POST', body, ifMatch:savedVersion(version), idempotencyKey:key});
  },
  getPrivateBlob: fetchPrivateBlob,
  async listEvidence(id: string): Promise<EvidenceRecord[]> {
    return fetchJson(`/api/v1/complaints/${encodeURIComponent(id)}/evidence`);
  },
  async grantHelper(id: string, helperId: string) {
    return fetchJson(`/api/v1/complaints/${encodeURIComponent(id)}/helper-grants`, {method:'POST', body:{helper_id:helperId}});
  },
  async revokeHelper(id: string, helperId: string) {
    return fetchJson(`/api/v1/complaints/${encodeURIComponent(id)}/helper-grants/${encodeURIComponent(helperId)}/revoke`, {method:'POST'});
  },
  async assignOfficer(id: string, officerId: string) {
    return fetchJson(`/api/v1/admin/complaints/${encodeURIComponent(id)}/assignment`, {method:'POST', body:{officer_id:officerId}});
  },
  async getReviewHelp(id:string):Promise<ReviewHelpInbox> {
    return fetchJson(`/api/v1/complaints/${encodeURIComponent(id)}/review-help`);
  },
  async requestReviewHelp(id:string, helperId:string, version:number|undefined, key:string):Promise<ReviewHelpRecord> {
    return fetchJson(`/api/v1/complaints/${encodeURIComponent(id)}/review-help`, {method:'POST',body:{helper_id:helperId,allow_sharing:true},ifMatch:savedVersion(version),idempotencyKey:key});
  },
  async actReviewHelp(id:string, requestId:string, version:number|undefined, note?:string):Promise<ReviewHelpRecord> {
    return fetchJson(`/api/v1/complaints/${encodeURIComponent(id)}/review-help/${note === undefined ? 'acknowledge' : 'respond'}`, {method:'POST',body:note === undefined ? {request_id:requestId} : {request_id:requestId,note},ifMatch:savedVersion(version)});
  },
  async getAgentProgress(id:string):Promise<CitizenAgentProgress> {
    return fetchJson(`/api/v1/complaints/${encodeURIComponent(id)}/agent-progress`);
  },
  async listAssignmentQueue(assignment: 'unassigned' | 'assigned' | 'all' = 'unassigned', before?: string): Promise<AdminAssignmentQueue> {
    const query = new URLSearchParams({assignment, limit:'25'});
    if (before) query.set('before', before);
    return fetchJson<AdminAssignmentQueue>('/api/v1/admin/complaints?' + query);
  },
  async listReviewEvents(id: string, officer = false): Promise<ReviewEvent[]> {
    return fetchJson(`/api/v1/${officer ? 'officer/' : ''}complaints/${encodeURIComponent(id)}/review-history`);
  },
  async replyToOfficer(id: string, message: string, version: number | undefined, key: string): Promise<ComplaintRecord> {
    return fetchJson(`/api/v1/complaints/${encodeURIComponent(id)}/review-response`, {method:'POST', body:{message,allow_recipient_sharing:true}, ifMatch:savedVersion(version), idempotencyKey:key});
  },
};

