import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "./api.js";

/**
 * Loads `path` from the API. Keeps the previous data while a new request
 * is running, so filters do not flash empty. Pass null to skip loading.
 * `fetcher` defaults to api(); the admin panel passes its own.
 */
export function useApi(path, fetcher = api) {
  const [state, setState] = useState({ data: null, error: null, loading: Boolean(path) });
  const [tick, setTick] = useState(0);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  useEffect(() => {
    if (!path) {
      setState({ data: null, error: null, loading: false });
      return undefined;
    }
    const ctrl = new AbortController();
    setState((s) => ({ ...s, loading: true, error: null }));
    fetcher(path, { signal: ctrl.signal })
      .then((data) => mounted.current && setState({ data, error: null, loading: false }))
      .catch((error) => {
        if (error?.name !== "AbortError" && mounted.current) setState((s) => ({ ...s, error, loading: false }));
      });
    return () => ctrl.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path, tick]);

  const reload = useCallback(() => setTick((t) => t + 1), []);
  const setData = useCallback((fn) => setState((s) => ({ ...s, data: typeof fn === "function" ? fn(s.data) : fn })), []);
  return { ...state, reload, setData };
}
