# GitHub Releases Guide

This document explains how to create releases for Kshana Desktop using GitHub Actions.

## Overview

When you push a version tag, GitHub Actions automatically:
1. Checks out the specified branches (frontend + backend)
2. Builds the backend with PyInstaller
3. Builds the Electron app
4. Creates DMG installers for Mac (arm64 + x64)
5. Publishes to GitHub Releases

## Quick Start

### Simple Release (Default Branches)

```bash
# 1. Make sure your code is committed and pushed
git checkout main
git pull origin main

# 2. Create and push a version tag
git tag v1.0.0
git push origin v1.0.0

# 3. Wait 5-10 minutes for the build to complete
# Check progress: https://github.com/anveshane/kshana-desktop/actions
```

### Release from Specific Branches

You can specify which branches to build from in the tag name:

```bash
# Format: v<VERSION>-<frontend-branch>-<backend-branch>
git tag v1.0.0-feature-branch-main
git push origin v1.0.0-feature-branch-main
```

**Examples:**
- `v1.0.0-dev-staging` → frontend: `dev`, backend: `staging`
- `v1.0.0-feature-preview-main` → frontend: `feature-preview`, backend: `main`
- `v1.0.0` → uses default branches (see workflow file)

## Default Branches

The workflow uses default branches if not specified in the tag. To change defaults, edit `.github/workflows/release.yml`:

```yaml
DEFAULT_FRONTEND_BRANCH: main
DEFAULT_BACKEND_BRANCH: main
```

## Tag Format

### Standard Version Tag
```
v1.0.0
v1.0.1
v2.0.0
```
Uses default branches configured in the workflow.

### Tag with Branch Specification
```
v1.0.0-<frontend-branch>-<backend-branch>
```
Examples:
- `v1.0.0-feature-main` → frontend from `feature`, backend from `main`
- `v1.0.0-dev-staging` → frontend from `dev`, backend from `staging`

## Complete Release Process

### Step 1: Prepare Your Code

```bash
# Switch to the branch you want to release
git checkout main
git pull origin main

# Make sure all changes are committed
git status
```

### Step 2: Update Version (Optional)

Edit `package.json` and update the version:
```json
{
  "version": "1.0.0"
}
```

Commit the change:
```bash
git add package.json
git commit -m "Bump version to 1.0.0"
git push origin main
```

### Step 3: Create and Push Tag

**Option A: Simple tag (uses default branches)**
```bash
git tag v1.0.0
git push origin v1.0.0
```

**Option B: Tag with branch specification**
```bash
git tag v1.0.0-feature-branch-main
git push origin v1.0.0-feature-branch-main
```

### Step 4: Monitor Build

1. Go to [Actions](https://github.com/anveshane/kshana-desktop/actions)
2. Find the "Release" workflow run
3. Wait for it to complete (~5-10 minutes)

### Step 5: Download Release

Once complete, the release will be available at:
- https://github.com/anveshane/kshana-desktop/releases

Download the DMG files:
- `Kshana-<version>-arm64.dmg` (Apple Silicon)
- `Kshana-<version>.dmg` (Intel Mac)

## What Gets Built

The workflow builds:

1. **Backend** (`kshana` repo)
   - Bundled with PyInstaller
   - Output: `backend-build/dist/kshana-backend-mac/`

2. **Electron App** (`kshana-desktop` repo)
   - React renderer
   - Electron main process
   - Output: DMG files in `release/build/`

3. **Release Assets**
   - Automatically uploaded to GitHub Releases
   - DMG files for both Mac architectures

## Troubleshooting

### Workflow Not Running?

- **Check tag format**: Must match `v*.*.*` pattern
- **Check Actions tab**: Look for any workflow errors
- **Verify tag was pushed**: `git ls-remote --tags origin`

### Build Failing?

Common issues:
- **Missing dependencies**: Check if `npm ci` or Python setup fails
- **Backend build errors**: Check PyInstaller logs
- **Electron build errors**: Check electron-builder logs

View detailed logs in the Actions tab.

### No DMG Files in Release?

- Check if `electron-builder` completed successfully
- Verify `GH_TOKEN` has permissions to create releases
- Check Actions logs for upload errors

### Wrong Branch Checked Out?

- Verify branch names in tag (if using branch specification)
- Check default branches in workflow file
- Ensure branches exist in both repositories

## Tag Management

### List All Tags
```bash
git tag
```

### Delete a Tag (Local)
```bash
git tag -d v1.0.0
```

### Delete a Tag (Remote)
```bash
git push origin :refs/tags/v1.0.0
```

### Create Tag from Specific Commit
```bash
git tag v1.0.0 <commit-hash>
git push origin v1.0.0
```

## Release Checklist

Before creating a release:

- [ ] Code is tested and ready
- [ ] Version updated in `package.json` (if needed)
- [ ] Changes committed and pushed
- [ ] Correct branch checked out
- [ ] Tag name follows versioning scheme
- [ ] Branch names correct (if specifying in tag)

## Workflow Configuration

The workflow file is located at:
`.github/workflows/release.yml`

Key settings:
- **Runner**: `macos-14` (Apple Silicon)
- **Node.js**: Version 20
- **Python**: Version 3.13
- **Publish**: Automatic via electron-builder

## Support

For issues or questions:
- Check [Actions logs](https://github.com/anveshane/kshana-desktop/actions)
- Review [GitHub Releases](https://github.com/anveshane/kshana-desktop/releases)
- Open an issue on GitHub

## Examples

### Release v1.0.0 from main branches
```bash
git tag v1.0.0
git push origin v1.0.0
```

### Release v1.1.0 from feature branch (frontend) and main (backend)
```bash
git tag v1.1.0-feature-preview-main
git push origin v1.1.0-feature-preview-main
```

### Release v2.0.0 from staging branches
```bash
git tag v2.0.0-staging-backend-staging
git push origin v2.0.0-staging-backend-staging
```

---

**Last Updated**: December 2024

