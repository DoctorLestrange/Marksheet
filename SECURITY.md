# Security Policy

## Privacy & Architecture

Marksheet is a static, client-side web application:
- All exam sessions, question records, and configuration settings are stored locally in your browser's `localStorage`.
- No user data is transmitted to external servers, analytics endpoints, or third-party APIs.

## Supported Versions

Security updates are applied to the latest release on the `main` branch.

## Reporting a Vulnerability

If you discover a security issue (such as a cross-site scripting vector, unsafe CSV export handling, or dependency vulnerability), please report it privately via GitHub's **Security Advisories** feature on this repository rather than opening a public issue.

Please include:
- A clear description of the vulnerability and its potential impact
- Steps to reproduce or a minimal proof of concept
- Any suggested remediation if known
