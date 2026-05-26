/**
 * QRIS (EMVCo) Dynamic Payload Generator
 * Implementation based on EMVCo QR Code Specification.
 */

// Calculate CRC-CCITT (0xFFFF) with polynomial 0x1021
export function calcCRC16(str: string): string {
  let crc = 0xFFFF;
  for (let i = 0; i < str.length; i++) {
    const code = str.charCodeAt(i);
    crc ^= (code << 8);
    for (let j = 0; j < 8; j++) {
      if (crc & 0x8000) {
        crc = (crc << 1) ^ 0x1021;
      } else {
        crc = crc << 1;
      }
    }
  }
  crc = crc & 0xFFFF;
  const hex = crc.toString(16).toUpperCase();
  return hex.padStart(4, '0');
}

/**
 * Parses a standard QRIS EMVCo string into a key-value Map
 */
export function parseTLV(qris: string): Map<string, string> {
  const map = new Map<string, string>();
  let i = 0;
  while (i < qris.length) {
    if (i + 4 > qris.length) break;
    const tag = qris.substring(i, i + 2);
    const lengthStr = qris.substring(i + 2, i + 4);
    const len = parseInt(lengthStr, 10);
    if (isNaN(len)) break;
    if (i + 4 + len > qris.length) break;
    const value = qris.substring(i + 4, i + 4 + len);
    map.set(tag, value);
    i += 4 + len;
  }
  return map;
}

/**
 * Builds a QRIS EMVCo string with a new CRC16 code
 */
export function buildQRIS(tags: Map<string, string>): string {
  // Always remove existing CRC tag 63
  tags.delete('63');

  // Build the string sorted by Tag number ascending (standard EMVCo presentation)
  let result = '';
  const sortedTags = Array.from(tags.keys()).sort();
  for (const tag of sortedTags) {
    const val = tags.get(tag) || '';
    const lenStr = val.length.toString().padStart(2, '0');
    result += `${tag}${lenStr}${val}`;
  }

  // Pre-calculate CRC string
  result += '6304';
  const crc = calcCRC16(result);
  result += crc;
  return result;
}

export const FALLBACK_STATIC_QRIS = 
  '00020101021130590016ID10202114353450118936001111000030040851440014ID.CO.QRIS.WWW0215ID10211435345015204000053033605802ID5912SNJ LOGISTIK6009KOTA ACEH6105232116304';

/**
 * Generates a dynamic QRIS string for a specific amount/nominal
 */
export function generateDynamicQRIS(staticQRIS: string, amount: number): string {
  const cleanStatic = (staticQRIS && staticQRIS.trim().startsWith('000201')) 
    ? staticQRIS.trim() 
    : FALLBACK_STATIC_QRIS;

  try {
    const tags = parseTLV(cleanStatic);
    
    // Set Point of Initiation Method to '12' (dynamic QRIS)
    tags.set('01', '12');
    
    // Set transaction currency to Indonesian Rupiah (IDR = 360) just in case
    tags.set('53', '360');

    // Set transaction nominal
    // EMVCo Amount can be integer without decimals or with decimals. We format it as a clean integer.
    const amtStr = Math.round(amount).toString();
    tags.set('54', amtStr);

    return buildQRIS(tags);
  } catch (error) {
    console.error('Failed to generate dynamic QRIS:', error);
    return cleanStatic; // fallback to the static or default one
  }
}
