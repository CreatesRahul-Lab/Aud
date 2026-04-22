type SSEClient = {
  clientId: string;
  controller: ReadableStreamDefaultController;
  encoder: TextEncoder;
};

const g = globalThis as unknown as { __sseRoomClients?: Map<string, SSEClient[]> };
const roomClients = (g.__sseRoomClients ??= new Map<string, SSEClient[]>());

function formatSSE(event: string, data: unknown): Uint8Array {
  const encoder = new TextEncoder();
  return encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
}

export function addClient(code: string, clientId: string, controller: ReadableStreamDefaultController) {
  const clients = roomClients.get(code) ?? [];
  clients.push({ clientId, controller, encoder: new TextEncoder() });
  roomClients.set(code, clients);
}

export function removeClient(code: string, clientId: string) {
  const clients = roomClients.get(code);
  if (!clients) return;

  const filtered = clients.filter((c) => c.clientId !== clientId);
  if (filtered.length === 0) {
    roomClients.delete(code);
  } else {
    roomClients.set(code, filtered);
  }
}

export function broadcast(code: string, event: string, data: unknown) {
  const clients = roomClients.get(code);
  if (!clients) return;

  const message = formatSSE(event, data);
  for (const client of clients) {
    try {
      client.controller.enqueue(message);
    } catch {
      // client already closed — will be cleaned up on disconnect
    }
  }
}

export function sendTo(code: string, clientId: string, event: string, data: unknown) {
  const clients = roomClients.get(code);
  if (!clients) return;

  const message = formatSSE(event, data);
  const client = clients.find((c) => c.clientId === clientId);
  if (client) {
    try {
      client.controller.enqueue(message);
    } catch {
      // client already closed
    }
  }
}

export function getClientCount(code: string) {
  return roomClients.get(code)?.length ?? 0;
}
