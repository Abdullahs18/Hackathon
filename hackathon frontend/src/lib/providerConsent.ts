import { dastakApi } from './apiClient';

export async function ensureProviderConsent(id: string, speech: boolean) {
  const rows = await dastakApi.listConsents(id);
  const needs = speech ? [
    {recipient: 'service:gtts', purpose: 'speech_synthesis', data_scopes: ['spoken_text']},
    {recipient: 'service:gemini-speech', purpose: 'speech_translation', data_scopes: ['spoken_text']},
  ] : [{recipient: 'service:gemini-voice', purpose: 'voice_processing', data_scopes: ['voice_audio', 'voice_transcript']}];
  try {
    for (const need of needs) {
      if (!rows.some(r => r.recipient === need.recipient && r.purpose === need.purpose && r.status === 'granted' && need.data_scopes.every(s => r.data_scopes.includes(s)))) {
        const existing = rows.find(r => r.recipient === need.recipient && r.purpose === need.purpose && r.status === 'granted');
        if (existing) await dastakApi.changeConsent(existing.consent_id, {data_scopes: [...new Set([...existing.data_scopes, ...need.data_scopes])]});
        else await dastakApi.grantConsent(id, need);
      }
    }
  } finally {
    window.dispatchEvent(new CustomEvent('dastak:consents-changed', {detail:id}));
  }
}
