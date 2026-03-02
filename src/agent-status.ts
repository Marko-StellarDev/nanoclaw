/**
 * Shared in-memory agent status registry.
 * Written by GroupQueue when containers start/stop.
 * Read by the API server for GET /api/status.
 */

type Status = 'thinking' | 'idle';

const statuses: Record<string, Status> = {};

export function setAgentStatus(folder: string, status: Status): void {
  statuses[folder] = status;
}

export function clearAgentStatus(folder: string): void {
  delete statuses[folder];
}

export function getAgentStatuses(): Record<string, Status> {
  return { ...statuses };
}
