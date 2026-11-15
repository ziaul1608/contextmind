import { useState, useEffect } from 'react';
import { apiClient } from '../api/client';
import type { HealthResponse } from '@contextmind/shared';

interface HealthState {
  status: 'loading' | 'healthy' | 'degraded' | 'error';
  data: HealthResponse | null;
}

export function useHealthCheck(): HealthState {
  const [state, setState] = useState<HealthState>({ status: 'loading', data: null });

  useEffect(() => {
    let mounted = true;

    async function check(): Promise<void> {
      try {
        const { data } = await apiClient.get<HealthResponse>('/health');
        if (!mounted) return;
        setState({
          status: data.status === 'ok' ? 'healthy' : 'degraded',
          data,
        });
      } catch {
        if (!mounted) return;
        setState({ status: 'error', data: null });
      }
    }

    void check();
    return () => {
      mounted = false;
    };
  }, []);

  return state;
}
