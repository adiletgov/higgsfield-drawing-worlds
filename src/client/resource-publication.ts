/** Invalidate in-flight reads before publishing a mutation or changing resources. */
export function createPublicationGate() {
  let revision = 0;
  return {
    begin() {
      const requestRevision = ++revision;
      return (publish: () => void) => {
        if (requestRevision !== revision) return false;
        publish();
        return true;
      };
    },
    invalidate() {
      revision++;
    },
  };
}
