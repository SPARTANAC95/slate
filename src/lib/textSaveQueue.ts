/** Track saves beyond a field's lifetime, so switching views cannot outrun an update. */
export function createTextSaveQueue() {
  const writes = new Map<string, Promise<unknown>>();
  const failures = new Map<string, unknown>();
  return {
    enqueue(key: string, save: () => void | Promise<unknown>) {
      const previous = writes.get(key) ?? Promise.resolve();
      const write = previous.catch(() => {}).then(save);
      writes.set(key, write);
      void write.then(() => {
        failures.delete(key);
        if (writes.get(key) === write) writes.delete(key);
      }, error => {
        failures.set(key, error);
        if (writes.get(key) === write) writes.delete(key);
      });
    },
    async wait() {
      await Promise.all([...writes.values()]);
      if (failures.size) throw failures.values().next().value;
    },
  };
}

export const textSaves = createTextSaveQueue();
