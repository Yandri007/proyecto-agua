const fs = require('fs');
const path = require('path');

const findPostgresTool = (toolName, configuredPath) => {
  if (configuredPath) return configuredPath;
  if (process.platform !== 'win32') return toolName;

  const postgresRoot = path.join(
    process.env.ProgramFiles || 'C:\\Program Files',
    'PostgreSQL'
  );
  try {
    const versions = fs.readdirSync(postgresRoot, { withFileTypes: true })
      .filter((entry) => entry.isDirectory() && /^\d+(\.\d+)*$/.test(entry.name))
      .map((entry) => entry.name)
      .sort((left, right) => Number(right.split('.')[0]) - Number(left.split('.')[0]));

    for (const version of versions) {
      const candidate = path.join(postgresRoot, version, 'bin', `${toolName}.exe`);
      if (fs.existsSync(candidate)) return candidate;
    }
  } catch (error) {
    // Fall back to PATH so the spawned process reports the actionable error.
  }
  return toolName;
};

module.exports = { findPostgresTool };
