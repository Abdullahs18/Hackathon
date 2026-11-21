import { useEffect, useRef, useState } from 'react';
import { Pause, Play, RotateCcw, Volume2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { dastakApi, generateIdempotencyKey, USE_MOCK } from '@/lib/apiClient';
import { ensureProviderConsent } from '@/lib/providerConsent';
import { ErrorBanner } from '@/components/shared/ErrorBanner';
import type { ComplaintRecord, SpeechRequest } from '@/types/dastak';

interface UrduAudioPlayerProps {
  title: string;
  urduText: string;
  englishSubtitle?: string;
  complaint?: ComplaintRecord | null;
  kind?: SpeechRequest['kind'];
  voiceTurnId?: string;
  questionIndex?: number;
}

function BrowserUrduAudioPlayer({
  title,
  urduText,
  englishSubtitle,
}: UrduAudioPlayerProps) {
  const [speaking, setSpeaking] = useState(false);
  const [paused, setPaused] = useState(false);
  const [voiceNote, setVoiceNote] = useState<string | null>(null);

  useEffect(() => {
    return () => {
      if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
        window.speechSynthesis.cancel();
      }
    };
  }, []);

  const startSpeaking = () => {
    if (
      typeof window === 'undefined' ||
      typeof window.speechSynthesis === 'undefined'
    ) {
      setVoiceNote(
        'Browser Speech Synthesis unavailable; displaying Urdu audio script visually.',
      );
      setSpeaking(true);
      globalThis.setTimeout(() => setSpeaking(false), 3000);
      return;
    }

    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(urduText);
    utterance.lang = 'ur-PK';
    utterance.rate = 0.92;

    const voices = window.speechSynthesis.getVoices();
    const urduVoice =
      voices.find((v) => v.lang.toLowerCase().startsWith('ur')) ??
      voices.find((v) => v.lang.toLowerCase().startsWith('ar'));

    if (urduVoice) {
      utterance.voice = urduVoice;
      setVoiceNote(null);
    } else {
      setVoiceNote(
        'Playing via default OS speech engine (no dedicated Urdu voice pack installed on this device).',
      );
    }

    utterance.onstart = () => {
      setSpeaking(true);
      setPaused(false);
    };
    utterance.onend = () => {
      setSpeaking(false);
      setPaused(false);
    };
    utterance.onerror = () => {
      setSpeaking(false);
      setPaused(false);
    };

    window.speechSynthesis.speak(utterance);
  };

  const togglePauseResume = () => {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;
    if (paused) {
      window.speechSynthesis.resume();
      setPaused(false);
    } else if (speaking) {
      window.speechSynthesis.pause();
      setPaused(true);
    }
  };

  const stopPlayback = () => {
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }
    setSpeaking(false);
    setPaused(false);
  };

  return (
    <div className="space-y-2.5 rounded-xl border border-blue-200 bg-blue-50/70 p-3.5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-xs font-semibold text-[#1E3A8A]">
          <Volume2 className="h-4 w-4 shrink-0" aria-hidden />
          <span>{title}</span>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          {!speaking ? (
            <Button
              type="button"
              size="sm"
              onClick={startSpeaking}
              className="min-h-10 gap-1.5 bg-[#1D4ED8] text-white hover:bg-[#1E40AF]"
            >
              <Play className="h-3.5 w-3.5" aria-hidden />
              <span>Listen in Urdu / سنیں</span>
            </Button>
          ) : (
            <>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={togglePauseResume}
                className="min-h-10 gap-1.5 bg-white"
              >
                {paused ? (
                  <>
                    <Play className="h-3.5 w-3.5" aria-hidden />
                    <span>Resume</span>
                  </>
                ) : (
                  <>
                    <Pause className="h-3.5 w-3.5" aria-hidden />
                    <span>Pause</span>
                  </>
                )}
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={stopPlayback}
                className="min-h-10 gap-1.5 bg-white"
              >
                <RotateCcw className="h-3.5 w-3.5" aria-hidden />
                <span>Stop</span>
              </Button>
            </>
          )}
        </div>
      </div>

      <p
        dir="rtl"
        lang="ur"
        className={`font-urdu rounded-lg border px-3 py-2 text-base transition-colors ${
          speaking && !paused
            ? 'border-blue-400 bg-white text-slate-950 shadow-xs'
            : 'border-blue-100 bg-white/80 text-slate-900'
        }`}
      >
        {urduText}
      </p>

      {englishSubtitle && (
        <p className="text-xs text-slate-600">{englishSubtitle}</p>
      )}
      {voiceNote && (
        <p className="text-[11px] text-slate-500">{voiceNote}</p>
      )}
    </div>
  );
}

function SavedUrduAudioPlayer({title, complaint, kind = 'review', voiceTurnId, questionIndex = 0}: UrduAudioPlayerProps) {
  const [allowed, setAllowed] = useState(false);
  const [loading, setLoading] = useState(false);
  const [url, setUrl] = useState<string | null>(null);
  const [savedText, setSavedText] = useState('');
  const [error, setError] = useState<unknown>(null);
  const generation = useRef(0);
  const objectUrl = useRef<string | null>(null);
  const key = useRef(generateIdempotencyKey());

  useEffect(() => {
    generation.current += 1;
    key.current = generateIdempotencyKey();
    setUrl(null);
    setSavedText('');
    setError(null);
    setLoading(false);
    setAllowed(false);
    return () => {
      generation.current += 1;
      if (objectUrl.current) URL.revokeObjectURL(objectUrl.current);
      objectUrl.current = null;
    };
  }, [complaint?.complaint_id, complaint?.version, kind, voiceTurnId, questionIndex]);

  async function loadAudio() {
    if (!complaint || !allowed || loading) return;
    const current = generation.current;
    setLoading(true);
    setError(null);
    try {
      await ensureProviderConsent(complaint.complaint_id, true);
      const request: SpeechRequest = {kind, allow_external_processing:true};
      if (kind === 'voice_summary') request.voice_turn_id = voiceTurnId;
      if (kind === 'follow_up') request.question_index = questionIndex;
      const speech = await dastakApi.createSpeech(complaint.complaint_id, request, complaint.version, key.current);
      const audio = await dastakApi.getPrivateBlob(speech.audio_path);
      if (!audio.type.startsWith('audio/mpeg')) throw new Error('The saved audio response was not MP3.');
      if (current !== generation.current) return;
      if (objectUrl.current) URL.revokeObjectURL(objectUrl.current);
      objectUrl.current = URL.createObjectURL(audio);
      setUrl(objectUrl.current);
      setSavedText(speech.text_ur);
    } catch (cause) { if (current === generation.current) setError(cause); }
    finally { if (current === generation.current) setLoading(false); }
  }

  return <section className="space-y-3 rounded-xl border border-blue-200 bg-blue-50/50 p-4" aria-label={title}>
    <h3 className="font-semibold">{title}</h3>
    {savedText ? <p dir="rtl" lang="ur" className="font-urdu whitespace-pre-wrap break-words text-right leading-loose [unicode-bidi:plaintext]" data-testid="saved-urdu-speech">{savedText}</p> : <p dir="rtl" lang="ur" className="font-urdu text-right leading-loose">اردو خلاصہ سننے اور پڑھنے کے لیے نیچے اجازت دے کر آڈیو بنائیں۔</p>}
    <label className="flex items-start gap-3 text-sm leading-relaxed"><input className="mt-1 shrink-0" type="checkbox" checked={allowed} onChange={e => setAllowed(e.target.checked)} /><span>I consent to send this saved text to Gemini for Urdu translation when needed, and to gTTS for Urdu audio. Each permission can be withdrawn in sharing settings.</span></label>
    <Button type="button" disabled={!allowed || !complaint || loading || (kind === 'review' && complaint.current_status !== 'CITIZEN_REVIEW')} onClick={() => void loadAudio()}>{loading ? 'Generating Urdu audio…' : 'Generate Urdu audio'}</Button>
    {url && <audio aria-label={title + ' playback'} controls src={url} />}
    {Boolean(error) && <ErrorBanner error={error} />}
  </section>;
}

export function UrduAudioPlayer(props: UrduAudioPlayerProps) {
  return USE_MOCK ? <BrowserUrduAudioPlayer {...props} /> : <SavedUrduAudioPlayer {...props} />;
}

