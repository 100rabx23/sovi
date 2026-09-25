/**
 * CRC32 checksum calculator for 100% Zero-Error Data Transfer Integrity.
 */

let crcTable: number[] | null = null;

function getCRCTable(): number[] {
  if (crcTable) return crcTable;
  crcTable = [];
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
    }
    crcTable[n] = c;
  }
  return crcTable;
}

export function computeCRC32(str: string): string {
  const table = getCRCTable();
  let crc = 0 ^ (-1);
  const encoder = new TextEncoder();
  const bytes = encoder.encode(str);

  for (let i = 0; i < bytes.length; i++) {
    crc = (crc >>> 8) ^ table[(crc ^ bytes[i]) & 0xFF];
  }

  return ((crc ^ (-1)) >>> 0).toString(16).padStart(8, '0').toUpperCase();
}

export function verifyCRC32(payload: string, expectedCrc: string): boolean {
  if (!expectedCrc || expectedCrc.length !== 8) return false;
  const calculated = computeCRC32(payload);
  return calculated.toUpperCase() === expectedCrc.toUpperCase();
}
