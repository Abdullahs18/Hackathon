import type { ComplaintRecord, ConsentGrant, ConsentRecord } from '@/types/dastak';

export type SharingNeed = ConsentGrant & {label: string};

// Mirrors the backend's submission_policy.scope_needs. Filing approval remains separate.
export function requiredSharing(complaint: ComplaintRecord | null | undefined): SharingNeed[] {
  if (!complaint?.destination_workspace_id) return [];
  const destination = complaint.destination_workspace_id;
  const draftFields = ['incident_type', 'incident_date', 'description', 'amount', 'currency', 'payment_method', 'transaction_reference', 'suspect_details'];
  const needs: SharingNeed[] = [
    {recipient: 'workspace:' + destination, label: destination === 'mock-financial-fraud' ? 'Mock Financial Fraud Intake' : destination === 'mock-digital-safety' ? 'Mock Digital Safety Intake' : destination, purpose: 'complaint_submission', data_scopes: ['case_status', ...draftFields.map(field => 'incident_data.' + field), ...(complaint.complaint_draft?.evidence_ids?.length ? ['evidence'] : [])]},
    {recipient: 'service:mock-identity', label: 'Simulated identity check', purpose: 'mock_identity_check', data_scopes: ['case_status', 'identity_reference']},
    {recipient: 'service:mock-data', label: 'Simulated reporting requirements', purpose: 'mock_requirements_lookup', data_scopes: ['case_status', 'incident_data.incident_type']},
  ];
  if (complaint.incident_data.transaction_reference?.trim()) needs.push({recipient: 'service:mock-payment', label: 'Simulated payment lookup', purpose: 'mock_payment_lookup', data_scopes: ['case_status', 'incident_data.transaction_reference', 'incident_data.amount', 'incident_data.currency', 'incident_data.payment_method']});
  return needs;
}

export function coversConsent(rows: ConsentRecord[], need: ConsentGrant): boolean {
  return rows.some(row => row.status === 'granted' && row.recipient === need.recipient && row.purpose === need.purpose && need.data_scopes.every(scope => row.data_scopes.includes(scope) || (scope.startsWith('incident_data.') && row.data_scopes.includes('incident_data'))));
}

export function missingSharing(complaint: ComplaintRecord | null | undefined, rows: ConsentRecord[]): SharingNeed[] {
  return requiredSharing(complaint).filter(need => !coversConsent(rows, need));
}
