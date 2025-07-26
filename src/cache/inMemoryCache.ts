import { Cache } from '../types.js';

interface Entry<T> {
  value: T;
  expires: number;
}

export class InMemoryCache implements Cache {
  private store = new Map<string, Entry<any>>();
  private maxSize: number;

  constructor(maxSize = 10000) {
    this.maxSize = maxSize;
  }

  get<T>(key: string): T | undefined {
    const e = this.store.get(key);
    if (!e) return undefined;
    if (Date.now() > e.expires) {
      this.store.delete(key);
      return undefined;
    }
    return e.value;
  }

  set<T>(key: string, value: T, ttlMs: number) {
    if (this.store.size >= this.maxSize) {
      // simple LRU eviction: delete first key
      const firstKey = this.store.keys().next().value;
      if (firstKey) this.store.delete(firstKey);
    }
    this.store.set(key, { value, expires: Date.now() + ttlMs });
  }
}
