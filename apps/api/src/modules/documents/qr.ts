/**
 * Self-contained ISO/IEC 18004 QR Code SVG generator (Byte mode, ECC Level L, Versions 1..10).
 * Evaluates all 8 standard mask patterns for optimal scannability and includes a 4-module quiet zone.
 */

const CAPACITIES = [0, 17, 32, 53, 78, 106, 134, 154, 192, 230, 271];
const TOTAL_CODEWORDS = [0, 26, 44, 70, 100, 134, 172, 196, 242, 292, 346];
const EC_CODEWORDS_PER_BLOCK = [0, 7, 10, 15, 20, 26, 18, 20, 24, 30, 18];
const NUM_BLOCKS = [0, 1, 1, 1, 1, 1, 2, 2, 2, 2, 4];

const ALIGNMENT: number[][] = [
  [],
  [],
  [6, 18],
  [6, 22],
  [6, 26],
  [6, 30],
  [6, 34],
  [6, 22, 38],
  [6, 24, 42],
  [6, 26, 46],
  [6, 28, 50],
];

// Precomputed 15-bit format strings for ECC Level L (01) and masks 0..7 (masked with 0x5412)
const FORMAT_BITS_L = [
  0x77c4, 0x72f3, 0x7daa, 0x789d, 0x662f, 0x6318, 0x6c41, 0x6976,
];

// Version information bits for versions 7..10
const VERSION_BITS: Record<number, number> = {
  7: 0x07c94,
  8: 0x085bc,
  9: 0x09a99,
  10: 0x0a4d3,
};

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

function maskBit(mask: number, r: number, c: number): boolean {
  switch (mask) {
    case 0:
      return (r + c) % 2 === 0;
    case 1:
      return r % 2 === 0;
    case 2:
      return c % 3 === 0;
    case 3:
      return (r + c) % 3 === 0;
    case 4:
      return (Math.floor(r / 2) + Math.floor(c / 3)) % 2 === 0;
    case 5:
      return ((r * c) % 2) + ((r * c) % 3) === 0;
    case 6:
      return (((r * c) % 2) + ((r * c) % 3)) % 2 === 0;
    case 7:
    default:
      return (((r + c) % 2) + ((r * c) % 3)) % 2 === 0;
  }
}

function writeFormatBits(modules: number[][], size: number, mask: number) {
  const fmt = FORMAT_BITS_L[mask]!;
  // Copy 1: around top-left finder
  // Bits 0..5 go up column 8 (rows 0..5)
  for (let i = 0; i <= 5; i++) modules[i]![8] = (fmt >> i) & 1;
  // Bit 6 at (row 7, col 8), Bit 7 at (row 8, col 8), Bit 8 at (row 8, col 7)
  modules[7]![8] = (fmt >> 6) & 1;
  modules[8]![8] = (fmt >> 7) & 1;
  modules[8]![7] = (fmt >> 8) & 1;
  // Bits 9..14 go left along row 8 (cols 5..0)
  for (let i = 9; i < 15; i++) modules[8]![14 - i] = (fmt >> i) & 1;

  // Copy 2: top-right (row 8, cols size-1..size-8) and bottom-left (col 8, rows size-7..size-1)
  for (let i = 0; i < 8; i++) modules[8]![size - 1 - i] = (fmt >> i) & 1;
  for (let i = 8; i < 15; i++) modules[size - 15 + i]![8] = (fmt >> i) & 1;
}

function penaltyScore(modules: number[][], size: number): number {
  let score = 0;
  // Adjacent modules in row/col having same color
  for (let r = 0; r < size; r++) {
    let runColor = modules[r]![0];
    let runLen = 1;
    for (let c = 1; c < size; c++) {
      if (modules[r]![c] === runColor) {
        runLen++;
        if (runLen === 5) score += 3;
        else if (runLen > 5) score += 1;
      } else {
        runColor = modules[r]![c];
        runLen = 1;
      }
    }
  }
  for (let c = 0; c < size; c++) {
    let runColor = modules[0]![c];
    let runLen = 1;
    for (let r = 1; r < size; r++) {
      if (modules[r]![c] === runColor) {
        runLen++;
        if (runLen === 5) score += 3;
        else if (runLen > 5) score += 1;
      } else {
        runColor = modules[r]![c];
        runLen = 1;
      }
    }
  }
  // 2x2 blocks
  for (let r = 0; r < size - 1; r++) {
    for (let c = 0; c < size - 1; c++) {
      const v = modules[r]![c];
      if (v === modules[r]![c + 1] && v === modules[r + 1]![c] && v === modules[r + 1]![c + 1]) {
        score += 3;
      }
    }
  }
  return score;
}

export function renderQrSvg(text: string, sizePx = 96): string {
  const bytes = new TextEncoder().encode(text);
  let ver = 1;
  while (ver < 10 && bytes.length > CAPACITIES[ver]!) ver++;
  const payload = bytes.length > CAPACITIES[ver]! ? bytes.slice(0, CAPACITIES[ver]!) : bytes;

  const size = 17 + ver * 4;
  const totalCodewords = TOTAL_CODEWORDS[ver]!;
  const numBlocks = NUM_BLOCKS[ver]!;
  const ecPerBlock = EC_CODEWORDS_PER_BLOCK[ver]!;
  const dataCapacity = totalCodewords - ecPerBlock * numBlocks;

  // Bit stream: 0100 (byte mode) + 8-bit length (for ver 1..9) or 16-bit length (ver 10) + bytes + terminator + pad
  const bits: number[] = [];
  const pushBits = (val: number, len: number) => {
    for (let i = len - 1; i >= 0; i--) bits.push((val >> i) & 1);
  };
  pushBits(0b0100, 4);
  pushBits(payload.length, ver <= 9 ? 8 : 16);
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

  // Split into blocks, compute Reed-Solomon EC for each block, and interleave
  const shortBlocks = numBlocks - (dataCapacity % numBlocks);
  const shortDataLen = Math.floor(dataCapacity / numBlocks);
  const dataBlocks: Uint8Array[] = [];
  const ecBlocks: Uint8Array[] = [];
  let offset = 0;
  for (let b = 0; b < numBlocks; b++) {
    const len = shortDataLen + (b < shortBlocks ? 0 : 1);
    const blk = dataWords.slice(offset, offset + len);
    offset += len;
    dataBlocks.push(blk);
    ecBlocks.push(rsRemainder(blk, ecPerBlock));
  }

  const finalWords = new Uint8Array(totalCodewords);
  let ptr = 0;
  const maxDataLen = shortDataLen + (shortBlocks < numBlocks ? 1 : 0);
  for (let i = 0; i < maxDataLen; i++) {
    for (let b = 0; b < numBlocks; b++) {
      if (i < dataBlocks[b]!.length) finalWords[ptr++] = dataBlocks[b]![i]!;
    }
  }
  for (let i = 0; i < ecPerBlock; i++) {
    for (let b = 0; b < numBlocks; b++) {
      finalWords[ptr++] = ecBlocks[b]![i]!;
    }
  }

  const baseModules: number[][] = Array.from({ length: size }, () => Array<number>(size).fill(0));
  const isFunc: boolean[][] = Array.from({ length: size }, () => Array<boolean>(size).fill(false));

  const setFunc = (r: number, c: number, val: boolean) => {
    if (r >= 0 && r < size && c >= 0 && c < size) {
      baseModules[r]![c] = val ? 1 : 0;
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

  // Timing patterns
  for (let i = 8; i < size - 8; i++) {
    setFunc(6, i, i % 2 === 0);
    setFunc(i, 6, i % 2 === 0);
  }

  // Alignment patterns
  const alignCoords = ALIGNMENT[ver] ?? [];
  for (let i = 0; i < alignCoords.length; i++) {
    for (let j = 0; j < alignCoords.length; j++) {
      if ((i === 0 && j === 0) || (i === 0 && j === alignCoords.length - 1) || (i === alignCoords.length - 1 && j === 0)) {
        continue;
      }
      const ar = alignCoords[i]!;
      const ac = alignCoords[j]!;
      for (let dy = -2; dy <= 2; dy++) {
        for (let dx = -2; dx <= 2; dx++) {
          setFunc(ar + dy, ac + dx, Math.max(Math.abs(dy), Math.abs(dx)) !== 1);
        }
      }
    }
  }

  // Version information (for versions >= 7)
  if (ver >= 7 && VERSION_BITS[ver]) {
    const vbits = VERSION_BITS[ver]!;
    for (let i = 0; i < 18; i++) {
      const bit = ((vbits >> i) & 1) === 1;
      const a = size - 11 + (i % 3);
      const b = Math.floor(i / 3);
      setFunc(b, a, bit);
      setFunc(a, b, bit);
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

  // Place raw data bits in upward/downward 2-column zig-zag
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
          baseModules[r]![c] = dark ? 1 : 0;
        }
      }
    }
  }

  // Choose the mask pattern (0..7) with the lowest penalty score
  let bestMask = 0;
  let bestPenalty = Infinity;
  let bestGrid: number[][] = baseModules;

  for (let mask = 0; mask < 8; mask++) {
    const candidate = baseModules.map((row, r) =>
      row.map((val, c) => {
        if (isFunc[r]![c]) return val;
        return maskBit(mask, r, c) ? val ^ 1 : val;
      }),
    );
    writeFormatBits(candidate, size, mask);
    const p = penaltyScore(candidate, size);
    if (p < bestPenalty) {
      bestPenalty = p;
      bestMask = mask;
      bestGrid = candidate;
    }
  }
  void bestMask;

  // Render SVG path with a standard 4-module quiet zone
  const margin = 4;
  let d = '';
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      if (bestGrid[r]![c]) d += `M${c + margin},${r + margin}h1v1h-1z`;
    }
  }

  const totalSize = size + margin * 2;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${totalSize} ${totalSize}" width="${sizePx}" height="${sizePx}" shape-rendering="crispEdges" aria-label="Verification QR code"><rect width="100%" height="100%" fill="#ffffff"/><path d="${d}" fill="#000000"/></svg>`;
}
