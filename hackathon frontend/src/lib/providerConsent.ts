import { dastakApi } from './apiClient';

export async function ensureProviderConsent(id: string, speech: boolean) {
  const recipient = speech ? 'service:gtts' : 'service:gemini-voice';
  const purpose = speech ? 'speech_synthesis' : 'voice_processing';
  const scopes = speech ? ['spoken_text'] : ['voice_audio', 'voice_transcript'];
  const rows = await dastakApi.listConsents(id);
  if (!rows.some(r => r.recipient === recipient && r.purpose === purpose && r.status === 'granted' && scopes.every(s => r.data_scopes.includes(s)))) {
    await dastakApi.grantConsent(id, {recipient, purpose, data_scopes: scopes});
  }
}
