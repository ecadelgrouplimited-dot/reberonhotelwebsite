/**
 * Self-contained ISO/IEC 18004 QR Code SVG generator (Byte mode, ECC Level L, Versions 1..6).
 * Zero external dependencies; renders a crisp inline <svg> for receipts, invoices & quotations.
 */

const CAPACITIES = [0, 17, 32, 53, 78, 106, 134];
const EC_CODEWORDS = [0, 7, 10, 15, 20, 26, 36]; // Version 6 has 2 blocks of 18 EC codewords
const ALIGNMENT = [[], [], [6, 18], [6, 22], [6, 26], [6, 30], [6, 34]];
const FORMAT_BITS_L = [
  0x77c4, 0x72f3, 0x7daa, 0x789d, 0x662f, 0x6318, 0x6c41, 0x6976,
];

const EXP = new Uint8Array(512);
const LOG = new Uint8Array(256);
(() => {
  let x = 1;
  for (let i = 0; i < 255; i++) {
    EXP[i] = x;
    LOG[x] = i;
    x <<= 1;
    if (x & 0x100) x ^= 0x11d;
  }
  for (let i = 255; i < 512; i++) EXP[i] = EXP[i - 255]!;
})();

function gfMul(a: number, b: number): number {
  return a === 0 || b === 0 ? 0 : EXP[LOG[a]! + LOG[b]!]!;
}

function rsGeneratorPoly(degree: number): Uint8Array {
  let poly = new Uint8Array([1]);
  for (let i = 0; i < degree; i++) {
    const next = new Uint8Array(poly.length + 1);
    const root = EXP[i]!;
    for (let j = 0; j < poly.length; j++) {
      next[j]! ^= poly[j]!;
      next[j + 1]! ^= gfMul(poly[j]!, root);
    }
    poly = next;
  }
  return poly;
}

function rsRemainder(data: Uint8Array, ecLen: number): Uint8Array {
  const gen = rsGeneratorPoly(ecLen);
  const rem = new Uint8Array(ecLen);
  for (const b of data) {
    const factor = b ^ rem[0]!;
    rem.copyWithin(0, 1);
    rem[ecLen - 1] = 0;
    for (let i = 0; i < ecLen; i++) {
      rem[i]! ^= gfMul(gen[i + 1]!, factor);
    }
  }
  return rem;
}

export function renderQrSvg(text: string, sizePx = 68): string {
  const bytes = new TextEncoder().encode(text);
  let ver = 1;
  while (ver < 6 && bytes.length > CAPACITIES[ver]!) ver++;
  const payload = bytes.length > CAPACITIES[ver]! ? bytes.slice(0, CAPACITIES[ver]!) : bytes;

  const size = 17 + ver * 4;
  const totalCodewords = ver === 1 ? 26 : ver === 2 ? 44 : ver === 3 ? 70 : ver === 4 ? 100 : ver === 5 ? 134 : 172;
  const ecTotal = EC_CODEWORDS[ver]!;
  const dataCapacity = totalCodewords - ecTotal;

  // Bit stream: 0100 (byte mode) + 8-bit length + bytes + terminator + pad
  const bits: number[] = [];
  const pushBits = (val: number, len: number) => {
    for (let i = len - 1; i >= 0; i--) bits.push((val >> i) & 1);
  };
  pushBits(0b0100, 4);
  pushBits(payload.length, 8);
  for (const b of payload) pushBits(b, 8);
  for (let i = 0; i < 4 && bits.length < dataCapacity * 8; i++) bits.push(0);
  while (bits.length % 8 !== 0) bits.push(0);

  const dataWords = new Uint8Array(dataCapacity);
  for (let i = 0; i < bits.length / 8; i++) {
    let w = 0;
    for (let b = 0; b < 8; b++) w = (w << 1) | bits[i * 8 + b]!;
    dataWords[i] = w;
  }
  let padIdx = Math.floor(bits.length / 8);
  let padToggle = true;
  while (padIdx < dataCapacity) {
    dataWords[padIdx++] = padToggle ? 0xec : 0x11;
    padToggle = !padToggle;
  }

  let finalWords: Uint8Array;
  if (ver === 6) {
    // Version 6-L uses 2 blocks of 68 data + 18 EC codewords
    const b1 = dataWords.slice(0, 68);
    const b2 = dataWords.slice(68, 136);
    const ec1 = rsRemainder(b1, 18);
    const ec2 = rsRemainder(b2, 18);
    finalWords = new Uint8Array(172);
    let idx = 0;
    for (let i = 0; i < 68; i++) {
      finalWords[idx++] = b1[i]!;
      finalWords[idx++] = b2[i]!;
    }
    for (let i = 0; i < 18; i++) {
      finalWords[idx++] = ec1[i]!;
      finalWords[idx++] = ec2[i]!;
    }
  } else {
    const ec = rsRemainder(dataWords, ecTotal);
    finalWords = new Uint8Array(totalCodewords);
    finalWords.set(dataWords, 0);
    finalWords.set(ec, dataCapacity);
  }

  const modules: number[][] = Array.from({ length: size }, () => Array<number>(size).fill(0));
  const isFunc: boolean[][] = Array.from({ length: size }, () => Array<boolean>(size).fill(false));

  const setFunc = (r: number, c: number, val: boolean) => {
    if (r >= 0 && r < size && c >= 0 && c < size) {
      modules[r]![c] = val ? 1 : 0;
      isFunc[r]![c] = true;
    }
  };

  const drawFinder = (r: number, c: number) => {
    for (let dy = -1; dy <= 7; dy++) {
      for (let dx = -1; dx <= 7; dx++) {
        const inside = dy >= 0 && dy <= 6 && dx >= 0 && dx <= 6;
        const ring = dy === 0 || dy === 6 || dx === 0 || dx === 6;
        const core = dy >= 2 && dy <= 4 && dx >= 2 && dx <= 4;
        setFunc(r + dy, c + dx, inside && (ring || core));
      }
    }
  };

  drawFinder(0, 0);
  drawFinder(0, size - 7);
  drawFinder(size - 7, 0);

  for (let i = 8; i < size - 8; i++) {
    setFunc(6, i, i % 2 === 0);
    setFunc(i, 6, i % 2 === 0);
  }

  const alignCoords = ALIGNMENT[ver] ?? [];
  for (const ar of alignCoords) {
    for (const ac of alignCoords) {
      if ((ar === 6 && ac === 6) || (ar === 6 && ac === size - 7) || (ar === size - 7 && ac === 6)) continue;
      for (let dy = -2; dy <= 2; dy++) {
        for (let dx = -2; dx <= 2; dx++) {
          setFunc(ar + dy, ac + dx, Math.max(Math.abs(dy), Math.abs(dx)) !== 1);
        }
      }
    }
  }

  // Reserve format info & dark module
  for (let i = 0; i <= 8; i++) {
    if (i !== 6) {
      isFunc[8]![i] = true;
      isFunc[i]![8] = true;
    }
  }
  for (let i = 0; i < 8; i++) {
    isFunc[8]![size - 1 - i] = true;
    isFunc[size - 1 - i]![8] = true;
  }
  setFunc(size - 8, 8, true);

  // Place data bits in upward/downward 2-column zig-zag
  let bitIdx = 0;
  const totalBits = finalWords.length * 8;
  for (let right = size - 1; right >= 1; right -= 2) {
    if (right === 6) right = 5;
    for (let vert = 0; vert < size; vert++) {
      const upwards = ((right + 1) & 2) === 0;
      const r = upwards ? size - 1 - vert : vert;
      for (let j = 0; j < 2; j++) {
        const c = right - j;
        if (!isFunc[r]![c]!) {
          let dark = false;
          if (bitIdx < totalBits) {
            dark = ((finalWords[bitIdx >> 3]! >> (7 - (bitIdx & 7))) & 1) === 1;
            bitIdx++;
          }
          // Mask 0: (r + c) % 2 === 0
          if ((r + c) % 2 === 0) dark = !dark;
          modules[r]![c] = dark ? 1 : 0;
        }
      }
    }
  }

  // Write format bits for Mask 0
  const fmt = FORMAT_BITS_L[0]!;
  for (let i = 0; i <= 5; i++) modules[8]![i] = (fmt >> i) & 1;
  modules[8]![7] = (fmt >> 6) & 1;
  modules[8]![8] = (fmt >> 7) & 1;
  modules[7]![8] = (fmt >> 8) & 1;
  for (let i = 9; i < 15; i++) modules[14 - i]![8] = (fmt >> i) & 1;

  for (let i = 0; i < 8; i++) modules[size - 1 - i]![8] = (fmt >> i) & 1;
  for (let i = 8; i < 15; i++) modules[8]![size - 15 + i] = (fmt >> i) & 1;

  // Render SVG path
  let d = '';
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      if (modules[r]![c]) d += `M${c + 1},${r + 1}h1v1h-1z`;
    }
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size + 2} ${size + 2}" width="${sizePx}" height="${sizePx}" shape-rendering="crispEdges" aria-label="Verification QR code"><rect width="100%" height="100%" fill="#fff"/><path d="${d}" fill="#121513"/></svg>`;
}
