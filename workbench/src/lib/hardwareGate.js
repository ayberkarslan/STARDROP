/** One ESP/SWD transport, one owner. Acquire synchronously before any await. */
export function createHardwareGate(onChange = () => {}) {
  let current = null;
  return {
    get current() { return current; },
    acquire(ownerId, label) {
      if (current) throw new Error(`Başka donanım işlemi sürüyor: ${current.label}. Bitmesini bekle.`);
      const lease = Object.freeze({ ownerId, label, id: crypto.randomUUID() });
      current = lease;
      onChange(current);
      return lease;
    },
    owns(lease) { return Boolean(lease && current === lease); },
    release(lease) {
      if (current !== lease) return false;
      current = null;
      onChange(null);
      return true;
    },
    async run(ownerId, label, operation) {
      const lease = this.acquire(ownerId, label);
      try { return await operation(lease); }
      finally { this.release(lease); }
    },
  };
}
