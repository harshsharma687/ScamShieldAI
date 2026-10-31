export function formatDate(value) {
  if (!value) return "—";

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) return "—";

  return date.toLocaleString(undefined, {
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function riskTone(riskLevel) {
  if (riskLevel === "Critical" || riskLevel === "High") return "warning";
  if (riskLevel === "Medium") return "info";
  if (riskLevel === "Low") return "info";
  return "info";
}

export function statusClass(statusLabel) {
  return String(statusLabel || "")
    .toLowerCase()
    .replaceAll(" ", "-");
}
