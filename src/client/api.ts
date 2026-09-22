import { useEffect, useRef, useState } from "react";
export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}
export async function api<T>(
  path: string,
  options: RequestInit = {},
  token?: string,
): Promise<T> {
  const timeout = AbortSignal.timeout(25000);
  const signal = options.signal
    ? AbortSignal.any([options.signal, timeout])
    : timeout;
  let response: Response;
  try {
    response = await fetch(path, {
      ...options,
      signal,
      credentials: "same-origin",
      headers: {
        ...(options.body ? { "Content-Type": "application/json" } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...options.headers,
      },
    });
  } catch (error) {
    if (options.signal?.aborted) throw error;
    throw new ApiError(
      "The connection was interrupted. Your world is safe. Try again when you are connected.",
      0,
    );
  }
  if (!response.ok) {
    const body = (await response.json().catch(() => ({}))) as {
      error?: string;
    };
    const fallback =
      response.status === 401 || response.status === 403
        ? "This link no longer has access. Ask the host for a new invitation."
        : response.status === 404
          ? "This world could not be found. Check the invitation with your host."
          : "This action could not be completed. Please try again.";
    throw new ApiError(body.error || fallback, response.status);
  }
  return response.json() as Promise<T>;
}
export function useResource<T>(
  path: string | null,
  token?: string,
  interval = 0,
) {
  const [data, setData] = useState<T>();
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [revision, setRevision] = useState(0);
  const resourceIdentity = useRef("");
  const refresh = () => setRevision((r) => r + 1);
  useEffect(() => {
    if (!path) {
      setData(undefined);
      setLoading(false);
      return;
    }
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    let stopped = false;
    let failures = 0;
    setLoading(true);
    const identity = `${path}:${token || ""}`;
    if (resourceIdentity.current !== identity) {
      setData(undefined);
      setError("");
      resourceIdentity.current = identity;
    }
    async function read() {
      try {
        const value = await api<T>(path!, { signal: controller.signal }, token);
        if (!stopped) {
          setData(value);
          setError("");
          failures = 0;
        }
      } catch (err) {
        if (!stopped) {
          setError(
            err instanceof Error ? err.message : "Could not load this world.",
          );
          failures++;
          if (err instanceof ApiError && [401, 403, 404].includes(err.status))
            failures = 6;
        }
      } finally {
        if (!stopped) {
          setLoading(false);
          if (interval && failures < 6)
            timer = setTimeout(read, Math.min(interval * 2 ** failures, 30000));
        }
      }
    }
    const wake = () => {
      if (document.visibilityState === "visible" && !stopped) {
        clearTimeout(timer);
        controller.abort();
        setRevision((r) => r + 1);
      }
    };
    void read();
    window.addEventListener("online", wake);
    document.addEventListener("visibilitychange", wake);
    return () => {
      stopped = true;
      controller.abort();
      clearTimeout(timer);
      window.removeEventListener("online", wake);
      document.removeEventListener("visibilitychange", wake);
    };
  }, [path, token, interval, revision]);
  return { data, error, loading, refresh, setData };
}
export function useFragmentToken(kind: string, id: string) {
  const [token] = useState(() => {
    const key = `drawing-worlds:${kind}:${id}`;
    try {
      const fragment = decodeURIComponent(location.hash.slice(1));
      if (fragment) {
        sessionStorage.setItem(key, fragment);
        history.replaceState(null, "", location.pathname);
        return fragment;
      }
      return sessionStorage.getItem(key) || undefined;
    } catch {
      return undefined;
    }
  });
  return token;
}
export function usePageTitle(title: string) {
  useEffect(() => {
    document.title = `${title} · Drawing Worlds`;
  }, [title]);
}
export function useUnsaved(dirty: boolean) {
  useEffect(() => {
    if (!dirty) return;
    const stop = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", stop);
    return () => window.removeEventListener("beforeunload", stop);
  }, [dirty]);
}
export function useAlive() {
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  return alive;
}
