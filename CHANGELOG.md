# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.0] - 2026-11-22

### Added
- Three-button exam scoring workspace (`Add Mark`, `Subtract Mark`, `Skip Question`) with keyboard shortcuts (`+`, `-`, `0`, `Backspace`, `← →`).
- Default scoring configuration (`+1` positive, `−0.25` negative, `100` questions) with custom settings, exam presets, and form validation.
- Integer-scaled decimal arithmetic (`10,000×`) to prevent floating-point drift and `-0` artifacts.
- Question-by-question record panel supporting a 10-column OMR grid view, tabular running-total list view, status filters, click-to-edit, clear, and multi-step undo.
- Persistent `localStorage` storage for the active session, archived session history, and configuration settings, with schema sanitization and corrupt-data recovery.
- Session history archive with expandable question-by-question inspection, session resume, CSV export, and inline delete confirmation.
- Automated GitHub Actions CI and GitHub Pages deployment workflows, plus Vercel and Netlify deployment configurations.
