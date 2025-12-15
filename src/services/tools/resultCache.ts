type Entry = { data: any; ts: number };

class ResultCache {
  private store = new Map<string, Entry>();
  private ttlMs = 10 * 60 * 1000; // 10 minutes

  set(id: string, data: any) {
    if (!id) return;
    this.store.set(id, { data, ts: Date.now() });
    this.gc();
  }

  get(id: string): any | null {
    const e = this.store.get(id);
    if (!e) return null;
    if (Date.now() - e.ts > this.ttlMs) {
      this.store.delete(id);
      return null;
    }
    return e.data;
  }

  private gc() {
    const now = Date.now();
    for (const [k, v] of this.store.entries()) {
      if (now - v.ts > this.ttlMs) this.store.delete(k);
    }
  }
}

export const resultCache = new ResultCache();

