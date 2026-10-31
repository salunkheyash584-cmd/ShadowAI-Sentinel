# Security policy

## Scope
ShadowAI Sentinel is a local-first browser extension prototype. Its purpose is to reduce accidental disclosure of recognizable sensitive strings in prompts on supported AI sites.

## Reporting
Do not include real credentials, personal information, or live exploit payloads in reports. Reproduce issues with synthetic examples and describe the browser version, extension version, target site's non-sensitive UI details, and expected versus observed behavior.

## Important limitations
- A clean scan does not prove that a prompt contains no sensitive information.
- Website DOM changes may bypass prompt interception.
- The extension does not protect traffic outside its supported browser pages.
- Users can override a warning; this is not tamper-resistant enterprise enforcement.
