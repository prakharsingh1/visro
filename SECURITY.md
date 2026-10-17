# Security reporting

Please report suspected security vulnerabilities privately through **Security → Report a vulnerability** on this repository. Include the Visro version, platform, steps to reproduce and the likely impact. Do not include API keys, access tokens, private projects or unredacted personal information.

For ordinary editing bugs and feature requests, use [GitHub Issues](https://github.com/prakharsingh1/visro/issues).

This is an early project with best-effort maintenance. Fixes target the current release; no response-time or long-term-support commitment is made.

The Mac app keeps projects local and encrypts the Gemini key through Electron safeStorage. Optional AI requests send the requested content to Google, and optional public-image search contacts Wikimedia Commons. Neither editing modes nor local comments constitute remote access control. Release signing is ad hoc, without Apple notarization. Implementation and validation details are in [docs/VALIDATION.md](docs/VALIDATION.md).
