import { browser } from 'wxt/browser';

export type VaultRequest =
  | { type: 'delete-url'; url: string; date?: string }
  | { type: 'delete-day'; date: string }
  | { type: 'clear-vault' }
  | { type: 'start-import'; reset?: boolean }
  | { type: 'cancel-import' };

export type VaultResponse = { ok: true } | { ok: false; error: string };

export async function sendVaultMessage(request: VaultRequest): Promise<VaultResponse> {
  try {
    const response: unknown = await browser.runtime.sendMessage(request);
    return isVaultResponse(response) ? response : { ok: false, error: '応答が不正です。' };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}

export function isVaultRequest(value: unknown): value is VaultRequest {
  if (typeof value !== 'object' || value === null) return false;
  const request = value as { type?: unknown; url?: unknown; date?: unknown };
  switch (request.type) {
    case 'delete-url':
      return typeof request.url === 'string';
    case 'delete-day':
      return typeof request.date === 'string';
    case 'clear-vault':
      return true;
    case 'start-import':
    case 'cancel-import':
      return true;
    default:
      return false;
  }
}

function isVaultResponse(value: unknown): value is VaultResponse {
  if (typeof value !== 'object' || value === null) return false;
  const response = value as { ok?: unknown; error?: unknown };
  return response.ok === true || (response.ok === false && typeof response.error === 'string');
}
