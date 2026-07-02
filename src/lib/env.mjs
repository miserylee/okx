import fs from "node:fs";

export function parseEnvFile(filePath) {
  const env = {};
  if (!fs.existsSync(filePath)) return env;

  const content = fs.readFileSync(filePath, "utf8");
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;

    const match = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (!match) {
      throw new Error(`Invalid env line in ${filePath}: ${rawLine}`);
    }

    let value = match[2].trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    env[match[1]] = value;
  }

  return env;
}

export function writeCredentialsTemplate(filePath) {
  if (fs.existsSync(filePath)) return false;
  fs.writeFileSync(
    filePath,
    [
      "OKX_API_KEY=",
      "OKX_SECRET_KEY=",
      "OKX_PASSPHRASE=",
      "",
    ].join("\n"),
  );
  return true;
}
