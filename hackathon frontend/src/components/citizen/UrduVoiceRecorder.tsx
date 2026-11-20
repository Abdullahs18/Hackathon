import { useEffect, useRef, useState } from 'react';
import { Mic, Sparkles, Square, Trash2, Volume2 } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { USE_MOCK } from '@/lib/apiClient';

export interface VoicePresetPayload {
  label: string;
  description: string;
  scam_message: string;
  platform: string;
  incident_date: string;
  money_lost: boolean;
  amount: number | null;
  payment_method: string | null;
  transaction_reference?: string | null;
  suspect_details: string[];
}

const DEMO_VOICE_PRESETS: VoicePresetPayload[] = [
  {
    label: '1. Relief Scam (Missing Txn Ref -> Follow-Up)',
    description:
      'مجھے سرکاری امداد کے نام پر جعلی میسج آیا۔ کال کرنے والے نے او ٹی پی پوچھا اور میرے ایزی پیسہ اکاؤنٹ سے 12000 روپے نکل گئے۔',
    scam_message:
      'Benazir Relief 25,000 PKR manzoor! Verify OTP code immediately on link.',
    platform: 'SMS / Phone Call',
    incident_date: '2026-11-19',
    money_lost: true,
    amount: 12000,
    payment_method: 'Easypaisa',
    transaction_reference: undefined,
    suspect_details: ['+92-300-0000511', 'imdad-relief-demo.example'],
  },
  {
    label: '2. Complete Phishing Transfer (Ready -> Review)',
    description:
      'میری دکان کے نمبر پر جعلی بینک لنک آیا، میں نے ایزی پیسہ سے 15000 روپے بھیج دیے۔ ٹرانزیکشن نمبر SYN-TXN-2026-0077 ہے۔',
    scam_message:
      'Account blocked alert: transfer 15000 PKR verification deposit via wallet.',
    platform: 'WhatsApp',
    incident_date: '2026-11-19',
    money_lost: true,
    amount: 15000,
    payment_method: 'Easypaisa',
    transaction_reference: 'SYN-TXN-2026-0077',
    suspect_details: ['+92-300-0000422'],
  },
  {
    label: '3. Contradictory Report (Human Review Stop)',
    description:
      'فراڈ کال آئی تھی، کوئی پیسہ نہیں کٹا لیکن میسج میں 30000 روپے نکلنے کا لکھا ہے۔',
    scam_message: '30000 PKR sent from wallet.',
    platform: 'Phone Call',
    incident_date: '2026-11-19',
    money_lost: false,
    amount: 30000,
    payment_method: 'Raast',
    transaction_reference: null,
    suspect_details: ['+92-300-0000333'],
  },
];

interface SpeechRecognitionAlternativeLike {
  transcript: string;
}

interface SpeechRecognitionResultLike {
  isFinal: boolean;
  0: SpeechRecognitionAlternativeLike;
}

interface SpeechRecognitionEventLike {
  resultIndex: number;
  results: ArrayLike<SpeechRecognitionResultLike>;
}

interface SpeechRecognitionLike {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((e: SpeechRecognitionEventLike) => void) | null;
  onerror: (() => void) | null;
  start: () => void;
  stop: () => void;
}

interface UrduVoiceRecorderProps {
  onTranscriptCaptured: (urduText: string) => void;
  onPresetApplied?: (preset: VoicePresetPayload) => void;
}

export function UrduVoiceRecorder({
  onTranscriptCaptured,
  onPresetApplied,
}: UrduVoiceRecorderProps) {
  const [recording, setRecording] = useState(false);
  const [elapsedSec, setElapsedSec] = useState(0);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [liveTranscript, setLiveTranscript] = useState('');
  const [micError, setMicError] = useState<string | null>(null);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);
  const timerRef = useRef<number | null>(null);
  const speechRef = useRef<SpeechRecognitionLike | null>(null);
  const transcriptRef = useRef<string>('');
  const audioUrlRef = useRef<string | null>(null);

  const stopResources = () => {
    if (timerRef.current !== null) {
      window.clearInterval(timerRef.current);
      timerRef.current = null;
    }
    if (speechRef.current) {
      try {
        speechRef.current.stop();
      } catch {
        // ignore
      }
      speechRef.current = null;
    }
    if (streamRef.current) {
      for (const track of streamRef.current.getTracks()) {
        track.stop();
      }
      streamRef.current = null;
    }
  };

  useEffect(() => {
    return () => {
      stopResources();
      if (audioUrlRef.current) {
        URL.revokeObjectURL(audioUrlRef.current);
      }
    };
  }, []);

  const formatDuration = (sec: number) => {
    const mins = Math.floor(sec / 60);
    const rem = sec % 60;
    return `${String(mins).padStart(2, '0')}:${String(rem).padStart(2, '0')}`;
  };

  const startRecording = async () => {
    setMicError(null);
    transcriptRef.current = '';
    setLiveTranscript('');

    if (
      typeof navigator === 'undefined' ||
      !navigator.mediaDevices ||
      !navigator.mediaDevices.getUserMedia ||
      typeof MediaRecorder === 'undefined'
    ) {
      setMicError(
        'Audio recording (MediaRecorder) is unavailable in this browser. Type Urdu/English below or use a Demo Urdu Voice Sample.',
      );
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      chunksRef.current = [];

      const recorder = new MediaRecorder(stream);
      mediaRecorderRef.current = recorder;

      recorder.ondataavailable = (ev) => {
        if (ev.data && ev.data.size > 0) {
          chunksRef.current.push(ev.data);
        }
      };

      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, {
          type: recorder.mimeType || 'audio/webm',
        });
        if (audioUrlRef.current) {
          URL.revokeObjectURL(audioUrlRef.current);
        }
        const nextUrl = URL.createObjectURL(blob);
        audioUrlRef.current = nextUrl;
        setAudioUrl(nextUrl);
        stopResources();
        setRecording(false);

        const spoken = transcriptRef.current.trim();
        if (spoken) {
          onTranscriptCaptured(spoken);
        } else if (USE_MOCK) {
          const fallbackSample =
            'مجھے جعلی سرکاری امداد کا پیغام آیا اور او ٹی پی پوچھ کر ایزی پیسہ سے 12000 روپے نکال لیے گئے۔';
          setLiveTranscript(fallbackSample);
          onTranscriptCaptured(fallbackSample);
        }
      };

      // Opportunistic Urdu SpeechRecognition when supported by browser
      const win = window as unknown as {
        SpeechRecognition?: new () => SpeechRecognitionLike;
        webkitSpeechRecognition?: new () => SpeechRecognitionLike;
      };
      const SpeechCtor = win.SpeechRecognition || win.webkitSpeechRecognition;
      if (SpeechCtor) {
        try {
          const recognition = new SpeechCtor();
          recognition.lang = 'ur-PK';
          recognition.continuous = true;
          recognition.interimResults = true;
          recognition.onresult = (event) => {
            let finalPart = '';
            for (let i = event.resultIndex; i < event.results.length; i += 1) {
              const res = event.results[i];
              if (res && res[0]) {
                finalPart += `${res[0].transcript} `;
              }
            }
            const clean = finalPart.trim();
            if (clean) {
              transcriptRef.current = clean;
              setLiveTranscript(clean);
            }
          };
          recognition.onerror = () => {
            // Keep MediaRecorder running even if SpeechRecognition fails
          };
          recognition.start();
          speechRef.current = recognition;
        } catch {
          // ignore unsupported SpeechRecognition error
        }
      }

      setElapsedSec(0);
      setRecording(true);
      recorder.start();
      timerRef.current = window.setInterval(() => {
        setElapsedSec((prev) => prev + 1);
      }, 1000);
    } catch {
      stopResources();
      setRecording(false);
      setMicError(
        'Microphone permission denied or no microphone detected. You can type in Urdu below or select a Demo Urdu Voice Sample.',
      );
    }
  };

  const stopRecording = () => {
    if (
      mediaRecorderRef.current &&
      mediaRecorderRef.current.state !== 'inactive'
    ) {
      mediaRecorderRef.current.stop();
    } else {
      stopResources();
      setRecording(false);
    }
  };

  const clearRecording = () => {
    if (audioUrlRef.current) {
      URL.revokeObjectURL(audioUrlRef.current);
      audioUrlRef.current = null;
    }
    setAudioUrl(null);
    setLiveTranscript('');
    setElapsedSec(0);
  };

  return (
    <div className="space-y-4 rounded-2xl border border-border bg-slate-50/70 p-3 sm:p-4">
      <div className="flex flex-col items-stretch gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-4">
          <div className="relative flex h-20 w-20 shrink-0 items-center justify-center">
            {recording && (
              <>
                <span aria-hidden className="mic-ring absolute inset-0 rounded-full bg-red-500/40" />
                <span aria-hidden className="mic-ring absolute inset-0 rounded-full bg-red-500/30 [animation-delay:0.8s]" />
              </>
            )}
            <button
              type="button"
              onClick={recording ? stopRecording : () => void startRecording()}
              aria-label={
                recording ? 'Stop Urdu voice recording' : 'Start Urdu voice recording'
              }
              aria-pressed={recording}
              className={`relative flex h-18 w-18 items-center justify-center rounded-full shadow-md transition-all active:scale-95 focus-visible:ring-4 focus-visible:ring-ring ${
                recording
                  ? 'bg-[#B91C1C] text-white ring-4 ring-red-200'
                  : 'bg-primary text-primary-foreground hover:bg-[#0B3D26]'
              }`}
            >
              {recording ? (
                <Square className="h-7 w-7 fill-current" aria-hidden />
              ) : (
                <Mic className="h-8 w-8" aria-hidden />
              )}
            </button>
          </div>
          <div aria-live="polite" className="min-w-0">
            <p className="flex items-center gap-2 text-sm font-semibold text-foreground">
              {recording && <span aria-hidden className="rec-dot inline-block h-2.5 w-2.5 rounded-full bg-[#B91C1C]" />}
              {recording
                ? `Recording… ${formatDuration(elapsedSec)}`
                : 'Tap Mic to Explain Incident in Urdu'}
            </p>
            <p
              dir="rtl"
              lang="ur"
              className="font-urdu text-sm font-medium text-primary"
            >
              {recording
                ? 'ریکارڈنگ جاری ہے — بولنے کے بعد لال بٹن دبائیں'
                : 'اردو میں واقعہ بیان کرنے کے لیے مائیک بٹن دبائیں'}
            </p>
          </div>
        </div>

        {recording && (
          <div
            aria-hidden
            className="flex h-12 items-end justify-center gap-1 rounded-lg border border-red-200 bg-white px-3 py-2 sm:justify-start"
          >
            {[0, 1, 2, 3, 4, 5, 6, 7, 8].map((idx) => (
              <span
                key={idx}
                style={{ animationDelay: `${(idx * 97) % 600}ms` }}
                className="animate-voice-bar h-8 w-1.5 origin-bottom rounded-full bg-[#B91C1C]"
              />
            ))}
          </div>
        )}
      </div>

      {micError && (
        <Alert className="border-amber-300 bg-amber-50 text-amber-950">
          <AlertDescription className="text-xs">{micError}</AlertDescription>
        </Alert>
      )}

      {audioUrl && (
        <div className="space-y-2 rounded-lg border border-border bg-card p-3">
          <div className="flex items-center justify-between gap-2">
            <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-foreground">
              <Volume2 className="h-4 w-4 text-primary" aria-hidden />
              <span>Recorded Urdu Voice Clip ({formatDuration(elapsedSec)})</span>
            </span>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={clearRecording}
              className="h-8 gap-1 text-xs text-destructive"
            >
              <Trash2 className="h-3.5 w-3.5" aria-hidden />
              <span>Discard</span>
            </Button>
          </div>
          <audio controls src={audioUrl} className="w-full" />
        </div>
      )}

      {liveTranscript && (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50/70 p-3">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-emerald-900">
            Transcribed Urdu Speech
          </p>
          <p dir="rtl" lang="ur" className="font-urdu mt-1 text-base text-slate-900">
            {liveTranscript}
          </p>
        </div>
      )}

      {USE_MOCK && onPresetApplied && (
        <div className="space-y-2 border-t border-border pt-3">
          <p className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
            <Sparkles className="h-3.5 w-3.5 text-primary" aria-hidden />
            <span>Demo Urdu Voice Presets (for noisy hackathon venues):</span>
          </p>
          <div className="flex flex-wrap gap-2">
            {DEMO_VOICE_PRESETS.map((preset) => (
              <Button
                key={preset.label}
                type="button"
                variant="outline"
                size="sm"
                className="min-h-10 bg-white text-xs"
                onClick={() => {
                  setLiveTranscript(preset.description);
                  onPresetApplied(preset);
                }}
              >
                {preset.label}
              </Button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
