import React, { useState, useEffect, useRef } from 'react';
import { ArrowLeft, Mic, MicOff, AlertCircle, CheckCircle2, ShieldCheck, XCircle, RefreshCw } from 'lucide-react';
import { motion } from 'motion/react';
import { startListening, stopListening, DecodeResult } from '../audio/ggwaveDecoder';
import { AudioWaveform } from '../components/AudioWaveform';

interface ReceivePageProps {
  onBack: () => void;
}

export function ReceivePage({ onBack }: ReceivePageProps) {
  const [isListening, setIsListening] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [decodeResult, setDecodeResult] = useState<DecodeResult | null>(null);
  const [status, setStatus] = useState<'idle' | 'listening' | 'decoding' | 'success' | 'corrupted' | 'error'>('idle');
  const [audioData, setAudioData] = useState<Float32Array | undefined>();
  
  const lastUpdateTime = useRef(0);

  useEffect(() => {
    return () => {
      stopListening();
    };
  }, []);

  const handleStartListening = async () => {
    setErrorMsg('');
    setDecodeResult(null);
    setStatus('listening');
    setIsListening(true);
    
    await startListening(
      () => {},
      async (result: DecodeResult) => {
        setIsListening(false);
        stopListening();
        setDecodeResult(result);
        
        if (result.valid) {
          setStatus('success');
          
          const history = JSON.parse(localStorage.getItem('sovi_history') || localStorage.getItem('soundmesh_history') || '[]');
          history.push({ 
            type: 'received', 
            message: result.message, 
            mode: result.mode || 'unknown',
            crc: result.crc,
            timestamp: new Date().toISOString() 
          });
          localStorage.setItem('sovi_history', JSON.stringify(history));
        } else {
          setStatus('corrupted');
        }
      },
      (data) => {
        const now = performance.now();
        if (now - lastUpdateTime.current > 33) {
          setAudioData(data);
          lastUpdateTime.current = now;
        }
      },
      (err) => {
        setIsListening(false);
        setStatus('error');
        setErrorMsg(err.message || 'Microphone access denied or error occurred.');
      }
    );
  };

  const handleStopListening = () => {
    stopListening();
    setIsListening(false);
    setStatus('idle');
  };

  const handleBack = () => {
    stopListening();
    onBack();
  };

  return (
    <div className="flex flex-col flex-1 h-[100dvh] relative overflow-hidden">
      <header className="flex items-center justify-between px-4 sm:px-6 py-4 sm:py-6 border-b border-white/5 bg-black/40 backdrop-blur-xl sticky top-0 z-20 w-full">
        <button onClick={handleBack} className="p-2 -ml-2 text-gray-400 hover:text-white transition-colors bg-white/5 rounded-full hover:bg-white/10">
          <ArrowLeft size={20} />
        </button>
        <div className="font-bold tracking-widest uppercase text-[11px] sm:text-sm text-gray-300">Receive Data</div>
        <div className="w-9"></div>
      </header>

      <main className="flex-1 overflow-y-auto px-4 sm:px-6 py-6 sm:py-8 pb-36 w-full max-w-2xl mx-auto flex flex-col items-center justify-center min-h-0">
        
        <div className="w-full flex flex-col items-center justify-center space-y-6 sm:space-y-8 h-full">
          
          {status !== 'success' && status !== 'corrupted' && (
            <div className="flex flex-col items-center justify-center space-y-6 flex-1 w-full">
              <div className="relative">
                {isListening && (
                  <>
                    <div className="absolute inset-0 bg-blue-500/20 rounded-full blur-xl animate-pulse"></div>
                    <div className="absolute inset-0 bg-blue-500/10 rounded-full scale-150 animate-ping" style={{ animationDuration: '3s' }}></div>
                  </>
                )}
                <div className={`w-28 h-28 sm:w-32 sm:h-32 rounded-full flex items-center justify-center transition-all duration-500 relative z-10 ${isListening ? 'bg-blue-600 shadow-[0_0_50px_rgba(59,130,246,0.6)]' : 'bg-white/5 border border-white/10'}`}>
                  <Mic size={48} className={isListening ? 'text-white' : 'text-gray-500'} />
                </div>
              </div>
              
              <div className="text-center space-y-2">
                <h2 className="text-2xl sm:text-3xl font-black tracking-tight text-white">
                  {status === 'idle' && 'Ready to receive'}
                  {status === 'listening' && 'Listening for acoustic tones...'}
                  {status === 'error' && 'Microphone Error'}
                </h2>
                <p className="text-sm text-gray-400 max-w-[280px] mx-auto leading-relaxed">
                  {status === 'listening' 
                    ? 'Capturing audio... Auto Gain & Zero-Error CRC active.' 
                    : 'Place receiver device near speaker or increase volume.'}
                </p>
              </div>

              {status === 'error' && (
                <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-2xl flex items-start space-x-3 text-red-400 backdrop-blur-sm mt-4 w-full">
                  <AlertCircle size={20} className="shrink-0 mt-0.5" />
                  <span className="text-sm">{errorMsg}</span>
                </div>
              )}

              <div className="w-full mt-8 bg-white/5 border border-white/10 rounded-3xl p-4 backdrop-blur-xl">
                <AudioWaveform isListening={isListening} audioData={audioData} />
              </div>
            </div>
          )}

          {/* Success Result */}
          {status === 'success' && decodeResult && (
            <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="w-full bg-blue-900/20 border border-blue-500/30 rounded-3xl p-6 sm:p-8 space-y-6 backdrop-blur-xl">
              <div className="flex flex-col items-center justify-center text-green-400 pb-6 border-b border-white/5 space-y-3">
                <div className="w-16 h-16 bg-green-500/20 rounded-full flex items-center justify-center">
                  <CheckCircle2 size={32} className="text-green-400" />
                </div>
                <div className="flex items-center space-x-2 bg-green-500/10 border border-green-500/30 px-3 py-1 rounded-full">
                  <ShieldCheck size={14} className="text-green-400" />
                  <span className="text-xs font-bold uppercase tracking-widest text-green-300">100% Zero-Error Verified</span>
                </div>
              </div>
              
              <div className="py-2 text-center">
                <div className="text-[10px] sm:text-xs text-gray-400 font-bold tracking-widest uppercase mb-4">Decoded Message</div>
                <div className="text-2xl sm:text-3xl font-medium leading-tight text-white">{decodeResult.message}</div>
              </div>

              <div className="pt-6 border-t border-white/5 space-y-2">
                <div className="flex justify-between items-center text-[10px] text-gray-400 font-mono">
                  <span>CRC32 Checksum: <strong className="text-blue-400">{decodeResult.crc || 'VERIFIED'}</strong></span>
                  <span>Mode: <strong className="text-purple-400 uppercase">{decodeResult.mode || 'N/A'}</strong></span>
                </div>
                <div className="font-mono text-[10px] sm:text-xs text-blue-400/60 break-all bg-black/40 p-3 rounded-xl border border-white/5">
                  {decodeResult.rawPayload}
                </div>
              </div>
            </motion.div>
          )}

          {/* Corrupted Result */}
          {status === 'corrupted' && decodeResult && (
            <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="w-full bg-amber-900/20 border border-amber-500/30 rounded-3xl p-6 sm:p-8 space-y-6 backdrop-blur-xl text-center">
              <div className="flex flex-col items-center justify-center text-amber-400 pb-6 border-b border-white/5 space-y-3">
                <div className="w-16 h-16 bg-amber-500/20 rounded-full flex items-center justify-center">
                  <XCircle size={32} className="text-amber-400" />
                </div>
                <span className="text-xs sm:text-sm font-bold uppercase tracking-widest text-amber-300">Signal Corruption Detected</span>
              </div>
              
              <div className="py-2 text-center space-y-2">
                <p className="text-sm text-gray-300">
                  {decodeResult.error || 'Audio signal was degraded by distance or environmental noise. Zero-error filter blocked corrupted data.'}
                </p>
                <div className="text-xs text-amber-400/80 bg-amber-500/10 p-3 rounded-xl border border-amber-500/20">
                  Tip: Switch sender to <strong>Long Range</strong> mode or bring devices closer together.
                </div>
              </div>

              <div className="pt-4 border-t border-white/5">
                <div className="text-[10px] text-gray-500 font-mono break-all bg-black/40 p-3 rounded-xl border border-white/5">
                  {decodeResult.rawPayload}
                </div>
              </div>
            </motion.div>
          )}

        </div>
      </main>

      {/* Fixed Bottom Action Bar */}
      <div className="fixed bottom-0 left-0 right-0 p-4 sm:p-6 bg-gradient-to-t from-[#020408] via-[#020408]/90 to-transparent z-20">
        <div className="max-w-2xl mx-auto w-full">
          {isListening ? (
            <button 
              onClick={handleStopListening}
              className="w-full py-5 rounded-3xl bg-white/10 text-white font-bold text-[15px] sm:text-sm tracking-widest uppercase border border-white/20 transition-all hover:bg-white/20 active:scale-[0.98] flex items-center justify-center space-x-3 backdrop-blur-md"
            >
              <MicOff size={22} />
              <span>Stop Listening</span>
            </button>
          ) : status === 'success' || status === 'corrupted' ? (
            <button 
              onClick={handleStartListening}
              className="w-full py-5 rounded-3xl bg-blue-600 text-white font-bold text-[15px] sm:text-sm tracking-widest uppercase shadow-lg shadow-blue-600/30 transition-all hover:bg-blue-500 active:scale-[0.98] flex items-center justify-center space-x-3"
            >
              <RefreshCw size={20} />
              <span>Listen Again</span>
            </button>
          ) : (
            <button 
              onClick={handleStartListening}
              className="w-full py-5 rounded-3xl bg-blue-600 text-white font-bold text-[15px] sm:text-sm tracking-widest uppercase shadow-lg shadow-blue-600/30 transition-all hover:bg-blue-500 active:scale-[0.98] flex items-center justify-center space-x-3"
            >
              <Mic size={22} />
              <span>Start Listening</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
