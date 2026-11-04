export function formatScheduleTime(value: Date | string) {
  if (typeof value === "string") return value.slice(0, 5);
  return `${String(value.getUTCHours()).padStart(2, "0")}:${String(value.getUTCMinutes()).padStart(2, "0")}`;
}

export function scheduleTimeDate(value: string) {
  if (!/^\d{2}:\d{2}$/.test(value)) throw new Error("La hora del turno no es válida.");
  const [hours, minutes] = value.split(":").map(Number);
  if (hours > 23 || minutes > 59) throw new Error("La hora del turno no es válida.");
  return new Date(`1970-01-01T${value}:00.000Z`);
}
