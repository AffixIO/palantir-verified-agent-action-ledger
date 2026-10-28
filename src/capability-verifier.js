/**
 * Transport adapter for an organisation-approved capability service.
 * The caller supplies credentials; none are stored in this repository.
 */
export function createCapabilityVerifier({ endpoint, getAccessToken, fetchImpl = globalThis.fetch, timeoutMs = 5_000 }) {
  const url = new URL(endpoint);
  if (url.protocol !== 'https:') throw new TypeError('capability_endpoint_must_use_https');
  if (typeof getAccessToken !== 'function') throw new TypeError('getAccessToken must be a function');
  if (typeof fetchImpl !== 'function') throw new TypeError('fetch implementation is required');
  return {
    async check(request) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      try {
        const token = await getAccessToken();
        if (!token || typeof token !== 'string') throw new Error('capability_access_token_unavailable');
        const response = await fetchImpl(url, {
          method: 'POST',
          headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json', accept: 'application/json' },
          body: JSON.stringify(request),
          signal: controller.signal,
        });
        if (!response.ok) throw new Error(`capability_service_http_${response.status}`);
        return await response.json();
      } finally {
        clearTimeout(timer);
      }
    },
  };
}
