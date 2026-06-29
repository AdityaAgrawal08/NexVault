export class BloomFilter {
  private size: number;
  private numHashes: number;
  private bitArray: Uint8Array;

  constructor(size = 10000, numHashes = 5) {
    this.size = size;
    this.numHashes = numHashes;
    this.bitArray = new Uint8Array(Math.ceil(size / 8));
  }

  private getHashes(val: string): number[] {
    const h1 = this.fnv1a(val);
    const h2 = this.djb2(val);
    const hashes: number[] = [];
    for (let i = 0; i < this.numHashes; i++) {
      hashes.push((h1 + i * h2) % this.size);
    }
    return hashes;
  }

  private fnv1a(str: string): number {
    let hash = 0x811c9dc5;
    for (let i = 0; i < str.length; i++) {
      hash ^= str.charCodeAt(i);
      hash = Math.imul(hash, 16777619);
    }
    return hash >>> 0;
  }

  private djb2(str: string): number {
    let hash = 5381;
    for (let i = 0; i < str.length; i++) {
      hash = (Math.imul(hash, 33) + str.charCodeAt(i)) | 0;
    }
    return hash >>> 0;
  }

  public add(val: string): void {
    const hashes = this.getHashes(val);
    for (const hash of hashes) {
      const byteIndex = Math.floor(hash / 8);
      const bitIndex = hash % 8;
      const current = this.bitArray[byteIndex];
      if (current !== undefined) {
        this.bitArray[byteIndex] = current | (1 << bitIndex);
      }
    }
  }

  public has(val: string): boolean {
    const hashes = this.getHashes(val);
    for (const hash of hashes) {
      const byteIndex = Math.floor(hash / 8);
      const bitIndex = hash % 8;
      const current = this.bitArray[byteIndex];
      if (current === undefined || (current & (1 << bitIndex)) === 0) {
        return false;
      }
    }
    return true;
  }
}
