export function formatRelativeDateTime(epochMs: number, now: number = Date.now()) {
  const diff = now - epochMs;
  if (diff < 30_000) return "agora";
  if (diff < 60_000) return "há 1 min";
  const mins = Math.floor(diff / 60_000);
  if (mins < 60) return `há ${mins} min`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `há ${hours} h`;
  const days = Math.floor(hours / 24);
  return `há ${days} d`;
}

export function formatDateTime(epochMs: number) {
  return new Date(epochMs).toLocaleString("pt-BR", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

