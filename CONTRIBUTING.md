# Contributing to RA-H

Thank you for your interest in contributing to RA-H! This guide explains how to work inside the private repo that powers the packaged Mac app.

> **Licensing note:** By contributing, you agree that your contributions are provided under the [PolyForm Noncommercial License 1.0.0](LICENSE). If you need a commercial exception, contact hello@ra-h.app before submitting changes.

## 🎯 Ways to Contribute

- **🐛 Bug Reports**: Found a bug? Let us know!
- **💡 Feature Requests**: Have ideas for new features?
- **📝 Documentation**: Help improve our docs
- **🔧 Code Contributions**: Fix bugs or implement features
- **🧪 Testing**: Help us test new features and find edge cases

## 🚀 Getting Started

### Development Setup
Begin with `docs/development/process/0_kickstart.md` for internal context. When touching the desktop build, read `docs/development/process/6_macpack.md` so you follow the packaging checklist. `docs/9_open-source.md` simply tracks the future BYO-key repo idea; there is no public OSS workflow today.

### Development Workflow
**Important**: We use Claude Code for all development. Follow the 7-step workflow documented in `docs/development/process/1_workflow.md`:

1. **Review** - Read handoff and workflow docs
2. **Branch** - Create feature branch (NEVER work on main)
3. **Plan** - Write PRD and get approval  
4. **Implement** - Code with user testing
5. **Document** - Update handoff and CLAUDE.md
6. **Commit** - Save and merge to main
7. **Cleanup** - Delete branch, confirm clean state

### Quick Commands
```bash
# Start new feature
git checkout main && git pull && git checkout -b feature/your-name

# Basic development
npm run build && npm run type-check && npm run lint

# Clean generated artefacts before committing
npm run clean:local
```

## 📝 Code Standards

### TypeScript
- Use strict TypeScript - no `any` types unless absolutely necessary
- Provide proper type definitions for all functions and objects
- Use meaningful interface names

### React/Next.js
- Use functional components with hooks
- Follow Next.js App Router patterns
- Use proper error boundaries

### Database
- All database operations must use the service layer (`/src/services/database/`)
- No direct SQL in components - use service methods
- Include proper error handling

### Styling
- Use Tailwind CSS utilities
- Follow the existing color scheme (dark theme)
- Ensure responsive design

## 🏗️ Project Architecture

See `docs/overview.md` for complete system architecture.

### Key Patterns
- Use service layer for all database operations
- Components organized by feature area
- Helpers are JSON-configured AI assistants
- All development follows 7-step Claude Code workflow


## 🧪 Testing
Manual testing is primary - use `npm run build && npm run type-check && npm run lint` to verify changes.

## 📚 Documentation

### What to Document
- New features and their usage
- API endpoint changes
- Database schema modifications
- Breaking changes

### Documentation Style
- Use clear, concise language
- Include code examples
- Add screenshots for UI changes
- Keep README.md updated

## 🚨 Issue Reporting

### Bug Reports
Include:
- Steps to reproduce
- Expected vs actual behavior
- Environment details (OS, Node version, etc.)
- Screenshots if applicable
- Error messages/logs

### Feature Requests
Include:
- Clear problem description
- Proposed solution
- Use cases
- Alternatives considered

## 🔍 Pull Request Process

### Before Submitting
- [ ] Tests pass locally
- [ ] Code follows our style guide
- [ ] Documentation updated if needed
- [ ] Branch is up to date with main

### PR Template
We'll provide a template, but include:
- **Description**: What does this PR do?
- **Type**: Bug fix, feature, docs, etc.
- **Testing**: How was this tested?
- **Screenshots**: For UI changes

### Review Process
1. Automated checks must pass
2. At least one maintainer review required
3. Address feedback promptly
4. Squash commits before merge

## 🏷️ Labels and Tagging

We use these labels:
- `bug` - Something isn't working
- `enhancement` - New feature or request
- `documentation` - Improvements to docs
- `good first issue` - Good for newcomers
- `help wanted` - Extra attention needed
- `priority: high/medium/low` - Priority levels

## 💬 Communication

### Channels
- **Issues**: Bug reports and feature requests
- **Discussions**: General questions and ideas
- **Pull Requests**: Code review discussions

### Code of Conduct
- Be respectful and inclusive
- Focus on constructive feedback
- Help others learn and grow
- Follow our [Code of Conduct](CODE_OF_CONDUCT.md)

## 🎉 Recognition

Contributors will be:
- Listed in our README acknowledgments
- Mentioned in release notes
- Invited to join our contributors team

## 📞 Getting Help

Stuck? Need help?
- Check existing issues and discussions
- Create a new discussion for questions
- Tag maintainers in issues if urgent
- Join our community discussions

---

**Happy Contributing!** 🚀

Your contributions help make RA-H better for everyone. Thank you for being part of our open-source community!
