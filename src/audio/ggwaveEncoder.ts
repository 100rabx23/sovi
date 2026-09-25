import { float32ToWav } from './wavExport';
import { initGGWave } from './ggwaveManager';
import { computeCRC32 } from './crc32';

let audioContext: AudioContext | null = null;

export type TransmissionMode = 'long-range' | 'normal' | 'fast' | 'ultrasound';

export function getProtocolId(mode: TransmissionMode, instance: any): number {
  switch (mode) {
    case 'long-range':
      return instance.ProtocolId.GGWAVE_PROTOCOL_AUDIBLE_SLOW ?? 3;
    case 'normal':
      return instance.ProtocolId.GGWAVE_PROTOCOL_AUDIBLE_NORMAL ?? 2;
    case 'ultrasound':
      return instance.ProtocolId.GGWAVE_PROTOCOL_ULTRASOUND_SLOW ?? 6;
    case 'fast':
    default:
      return instance.ProtocolId.GGWAVE_PROTOCOL_AUDIBLE_FAST ?? 1;
  }
}

export function buildPacket(message: string, mode: TransmissionMode): { packet: string; crc: string } {
  const cleanMessage = message.trim();
  const crc = computeCRC32(cleanMessage);
  // Protocol specification SM2|<8-CHAR-CRC32>|<MODE>|<PAYLOAD>
  const packet = `SM2|${crc}|${mode}|${cleanMessage}`;
  return { packet, crc };
}

export async function generateWavBlob(message: string, mode: TransmissionMode = 'long-range'): Promise<Blob> {
  const { instance, inst } = await initGGWave();
  const protocolId = getProtocolId(mode, instance);
  
  // Volume 70 for maximum long-range acoustic reach
  const volume = mode === 'long-range' ? 80 : 50;
  const txBytes = instance.encode(inst, message, protocolId, volume);
  const floatArray = new Float32Array(txBytes.buffer, txBytes.byteOffset, txBytes.byteLength / 4);
  return float32ToWav(floatArray, 48000);
}

export async function transmitMessage(
  message: string,
  mode: TransmissionMode = 'long-range',
  onProgress?: (progress: number) => void
): Promise<{ packet: string; crc: string }> {
  const { instance, inst } = await initGGWave();

  if (!audioContext || audioContext.state === 'closed') {
    audioContext = new (window.AudioContext || (window as any).webkitAudioContext)({
      sampleRate: 48000,
    });
  }

  if (audioContext.state === 'suspended') {
    await audioContext.resume();
  }

  const { packet, crc } = buildPacket(message, mode);
  const protocolId = getProtocolId(mode, instance);
  
  // Long range mode uses higher base volume and slower symbol rate for room penetration
  const volume = mode === 'long-range' ? 85 : 50;

  const txBytes = instance.encode(inst, packet, protocolId, volume);
  const floatArray = new Float32Array(txBytes.buffer, txBytes.byteOffset, txBytes.byteLength / 4);

  // Peak normalization to maximize acoustic power without clipping
  let maxVal = 0;
  for (let i = 0; i < floatArray.length; i++) {
    const absVal = Math.abs(floatArray[i]);
    if (absVal > maxVal) maxVal = absVal;
  }
  
  if (maxVal > 0) {
    const targetPeak = 0.95; // Maximize sound level for long distance
    const ampRatio = targetPeak / maxVal;
    for (let i = 0; i < floatArray.length; i++) {
      floatArray[i] *= ampRatio;
    }
  }

  const audioBuffer = audioContext.createBuffer(1, floatArray.length, 48000);
  audioBuffer.copyToChannel(floatArray, 0);

  const source = audioContext.createBufferSource();
  source.buffer = audioBuffer;
  
  const gainNode = audioContext.createGain();
  // Safe gain ceiling
  gainNode.gain.value = mode === 'long-range' ? 1.0 : 0.85;
  
  source.connect(gainNode);
  gainNode.connect(audioContext.destination);
  
  const durationMs = (floatArray.length / 48000) * 1000;
  
  return new Promise((resolve) => {
    source.onended = () => {
      resolve({ packet, crc });
    };
    source.start();

    if (onProgress) {
      const startTime = performance.now();
      const interval = setInterval(() => {
        const elapsed = performance.now() - startTime;
        let p = elapsed / durationMs;
        if (p >= 1) {
          p = 1;
          clearInterval(interval);
        }
        onProgress(p);
      }, 50);
    }
  });
}
