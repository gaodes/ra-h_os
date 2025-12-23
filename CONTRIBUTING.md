# Contributing to RA-H Open Source

This is the **open source mirror** of a private repository. Features are developed privately and synced here periodically.

## How to Contribute

### Bug Reports & Feature Requests
Open an [issue](../../issues). Include:
- What you expected vs what happened
- Steps to reproduce (for bugs)
- Your environment (OS, Node version, browser)

### Code Contributions
We accept pull requests for:
- **Bug fixes** - especially ones you've encountered
- **Documentation improvements** - typos, clarifications, examples
- **Small enhancements** - that don't require architectural changes

For **larger features**, open an issue first to discuss. Major features are typically implemented in the private repo and synced here.

## Development Setup

```bash
git clone https://github.com/bradwmorris/ra-h_os.git
cd ra-h_os
npm install
npm rebuild better-sqlite3
scripts/dev/bootstrap-local.sh
npm run dev
```

Open http://localhost:3000 and add your API keys.

## Before Submitting a PR

```bash
npm run build
npm run type-check
npm run lint
```

All three must pass.

## Code Style

- TypeScript with strict types (avoid `any`)
- Functional React components
- Tailwind CSS for styling
- Database operations through service layer (`/src/services/database/`)

## What Happens to Your Contribution

1. We review and merge to this repo
2. If applicable, we port the fix to the private repo
3. Future syncs won't overwrite your contribution

## Code of Conduct

Be respectful. No harassment, trolling, or personal attacks. Focus on constructive feedback.

## License

By contributing, you agree your work is licensed under [MIT](LICENSE).

## Questions?

Open a [discussion](../../discussions) or check existing issues.
