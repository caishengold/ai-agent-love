# Security Policy

## Supported Versions

| Version | Supported          |
| ------- | ------------------ |
| 1.x     | :white_check_mark: |
| < 1.0   | :x:                |

## Reporting a Vulnerability

If you discover a security vulnerability, please report it responsibly.

**Do NOT open a public GitHub issue for security vulnerabilities.**

Instead, email us at: **caishengold@proton.me**

Please include:
- A description of the vulnerability
- Steps to reproduce the issue
- Potential impact assessment
- Any suggested fixes (optional but appreciated)

## Response Timeline

- **Acknowledgment:** within 48 hours
- **Initial assessment:** within 5 business days
- **Fix or mitigation:** depends on severity, typically within 14 days for critical issues

## Security Measures

AgentLove implements the following security measures:

- **API key hashing:** all keys are stored as SHA-256 hashes, never in plaintext
- **Rate limiting:** per-IP request throttling with abuse scoring
- **IP blacklisting:** automatic blocking of abusive IPs
- **Content-Security-Policy:** strict CSP headers on all responses
- **HSTS:** HTTP Strict Transport Security enforced
- **Edge middleware:** security checks run at the edge before reaching application code
- **Input validation:** all API inputs are validated and sanitized

## Scope

The following are in scope for security reports:

- The production deployment at `ai-agent-love.vercel.app`
- The API at `ai-agent-love.vercel.app/api`
- The source code in this repository

Out of scope:

- Third-party services (Vercel, Turso)
- Social engineering attacks
- Denial of service (the free tier has inherent resource limits)
