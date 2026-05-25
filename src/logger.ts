type LogLevel = "info" | "warn" | "error";

function write(level: LogLevel, event: string, fields: Record<string, unknown> = {}) {
  const line = {
    level,
    event,
    service: "wa-digest",
    ts: new Date().toISOString(),
    ...fields
  };
  const message = JSON.stringify(line);
  if (level === "error") {
    // eslint-disable-next-line no-console
    console.error(message);
    return;
  }
  // eslint-disable-next-line no-console
  console.log(message);
}

export const logger = {
  info(event: string, fields?: Record<string, unknown>) {
    write("info", event, fields);
  },
  warn(event: string, fields?: Record<string, unknown>) {
    write("warn", event, fields);
  },
  error(event: string, fields?: Record<string, unknown>) {
    write("error", event, fields);
  }
};
