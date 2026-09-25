import { initGGWave } from './ggwaveManager';
import { verifyCRC32 } from './crc32';

let audioContext: AudioContext | null = null;
let mediaStream: MediaStream | null = null;
let scriptNode: ScriptProcessorNode | null = null;
let sourceNode: MediaStreamAudioSourceNode | null = null;
let analyser: AnalyserNode | null = null;

export interface DecodeResult {
  valid: boolean;
  message: string;
  crc?: string;
  mode?: string;
  rawPayload: string;
  error?: string;
}

export async function startListening(
  onSignalDetected: () => void,
  onMessageDecoded: (result: DecodeResult) => void,
  onAudioData: (data: Float32Array) => void,
  onError: (error: Error) => void
) {
  try {
    const { instance, inst } = await initGGWave();

    mediaStream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: false,
        noiseSuppression: false,
        autoGainControl: true, // Enables maximum sensitivity for distant sounds
        channelCount: 1,
        sampleRate: 48000
      }
    });

    if (!audioContext || audioContext.state === 'closed') {
      audioContext = new (window.AudioContext || (window as any).webkitAudioContext)({
        sampleRate: 48000,
      });
    }

    if (audioContext.state === 'suspended') {
      await audioContext.resume();
    }

    sourceNode = audioContext.createMediaStreamSource(mediaStream);
    
    analyser = audioContext.createAnalyser();
    analyser.fftSize = 2048;
    
    const bufferSize = 4096;
    scriptNode = audioContext.createScriptProcessor(bufferSize, 1, 1);

    let decodingBuffer: Int8Array[] = [];
    let isProcessing = false;

    scriptNode.onaudioprocess = (audioProcessingEvent) => {
      if (isProcessing) return;
      
      const inputBuffer = audioProcessingEvent.inputBuffer;
      const inputData = inputBuffer.getChannelData(0);
      
      onAudioData(new Float32Array(inputData));

      const bytes = new Int8Array(inputData.buffer, inputData.byteOffset, inputData.byteLength);
      decodingBuffer.push(new Int8Array(bytes));

      if (decodingBuffer.length >= 4) {
        isProcessing = true;
        
        const totalLength = decodingBuffer.reduce((sum, buf) => sum + buf.length, 0);
        const combinedBuffer = new Int8Array(totalLength);
        let offset = 0;
        for (const buf of decodingBuffer) {
          combinedBuffer.set(buf, offset);
          offset += buf.length;
        }
        
        try {
          const rxBytes = instance.decode(inst, combinedBuffer);
          
          if (rxBytes && rxBytes.length > 0) {
            const decodedString = new TextDecoder().decode(rxBytes).trim();
            
            if (decodedString.length > 0) {
              isProcessing = false;
              decodingBuffer = [];

              let decodeResult: DecodeResult;

              if (decodedString.startsWith('SM2|')) {
                const parts = decodedString.split('|');
                const crc = parts[1] || '';
                const mode = parts[2] || 'long-range';
                const payload = parts.slice(3).join('|');

                const isIntegrityValid = verifyCRC32(payload, crc);

                decodeResult = {
                  valid: isIntegrityValid,
                  message: payload,
                  crc,
                  mode,
                  rawPayload: decodedString,
                  error: isIntegrityValid ? undefined : 'CRC32 checksum mismatch (Acoustic signal was corrupted by distance or noise).'
                };
              } else if (decodedString.startsWith('SM1|')) {
                const parts = decodedString.split('|');
                const payload = parts.length >= 3 ? parts.slice(2).join('|') : decodedString;
                decodeResult = {
                  valid: true,
                  message: payload,
                  rawPayload: decodedString
                };
              } else {
                decodeResult = {
                  valid: true,
                  message: decodedString,
                  rawPayload: decodedString
                };
              }

              onMessageDecoded(decodeResult);
              return;
            }
          }
        } catch (err) {
          console.error("Decoding error:", err);
        }
        
        decodingBuffer = [decodingBuffer[decodingBuffer.length - 1]];
        isProcessing = false;
      }
    };

    sourceNode.connect(analyser);
    analyser.connect(scriptNode);
    scriptNode.connect(audioContext.destination);

  } catch (error: any) {
    console.error("Listening error:", error);
    onError(error);
  }
}

export function stopListening() {
  if (scriptNode && audioContext) {
    scriptNode.disconnect();
    if (sourceNode) sourceNode.disconnect();
    if (analyser) analyser.disconnect();
    scriptNode = null;
    sourceNode = null;
    analyser = null;
  }
  
  if (mediaStream) {
    mediaStream.getTracks().forEach(track => track.stop());
    mediaStream = null;
  }
}
