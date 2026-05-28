export class ApiError extends Error {
  constructor(message, { status, body, url, cause } = {}) {
    super(message, { cause });
    this.name = 'ApiError';
    this.status = status;
    this.body = body;
    this.url = url;
  }
}

export async function requestJson(url, options = {}, fetchImpl = globalThis.fetch) {
  let response;

  try {
    response = await fetchImpl(url, options);
  } catch (error) {
    throw new ApiError(`Request failed: ${url}`, { url, cause: error });
  }

  const text = await response.text();
  const body = parseJsonBody(text);

  if (!response.ok) {
    const detail = body?.message || body?.error || text || response.statusText;
    throw new ApiError(`Request failed with ${response.status}: ${detail}`, {
      body,
      status: response.status,
      url
    });
  }

  return body;
}

function parseJsonBody(text) {
  if (!text) {
    return null;
  }

  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}
