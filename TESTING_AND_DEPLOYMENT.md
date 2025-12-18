# Testing and Deployment Guide

This guide walks you through testing the new bundling strategy locally and deploying to production.

## Prerequisites

Before testing, ensure you have:
- Node.js 20+ installed
- pnpm installed (for kshana-ink): `npm install -g pnpm@10.24.0`
- Both repositories cloned:
  - `kshana-desktop` (frontend)
  - `kshana-ink` (backend)

## Local Testing Guide

### Step 1: Prepare Your Environment

1. **Checkout the correct branches:**
   ```bash
   # In kshana-desktop directory
   cd kshana-desktop
   git checkout fix/version-2
   git pull origin fix/version-2
   
   # In kshana-ink directory (should be sibling to kshana-desktop)
   cd ../kshana-ink
   git checkout merged-cleanup-fixes
   git pull origin merged-cleanup-fixes
   ```

2. **Verify directory structure:**
   ```
   Kshana/
   ├── kshana-desktop/     (frontend)
   └── kshana-ink/         (backend)
   ```

### Step 2: Build kshana-ink

```bash
cd kshana-ink
pnpm install
pnpm build
```

**Verify build succeeded:**
```bash
# Check that these files exist:
ls dist/server/index.js
ls dist/core/llm/index.js
ls dist/prompts/
```

### Step 3: Test Verification Script

```bash
cd ../kshana-desktop
npx ts-node ./.erb/scripts/verify-kshana-ink.ts ../kshana-ink
```

**Expected output:**
```
Verifying kshana-ink at: /path/to/kshana-ink
✓ kshana-ink verification passed
  - Server module: /path/to/kshana-ink/dist/server/index.js
  - LLM module: /path/to/kshana-ink/dist/core/llm/index.js
  - Prompts: /path/to/kshana-ink/dist/prompts
✓ Version information recorded:
  - Branch: merged-cleanup-fixes
  - Commit: abc123...
  - Date: 2024-01-01T00:00:00Z
  - Saved to: release/app/.kshana-ink-version.json

✓ kshana-ink verification complete - ready for packaging
```

### Step 4: Test Install App Dependencies Script

```bash
cd kshana-desktop

# Clean release/app directory first (optional, but recommended)
rm -rf release/app

# Run the install script
npx ts-node ./.erb/scripts/install-app-deps.ts
```

**Expected output:**
```
✓ Added kshana-ink dependencies to package.json (CLI-only deps excluded)
✓ Temporarily removed kshana-ink from dependencies (will copy directly)
Installing app dependencies...
✓ App dependencies installed successfully
Copying kshana-ink from /path/to/kshana-ink to /path/to/release/app/node_modules/kshana-ink...
✓ kshana-ink copied successfully (production artifacts only)
✓ kshana-ink copy validation passed
```

**Verify the copy:**
```bash
# Check that kshana-ink was copied correctly
ls release/app/node_modules/kshana-ink/dist/server/index.js
ls release/app/node_modules/kshana-ink/dist/core/llm/index.js
ls release/app/node_modules/kshana-ink/package.json

# Verify NO symlink exists
ls -la release/app/node_modules/kshana-ink
# Should show 'd' (directory), NOT 'l' (symlink)
```

### Step 5: Test Full Build Process

```bash
cd kshana-desktop

# Run the full package command (includes verification via prepackage)
npm run package
```

**What happens:**
1. `prepackage` script runs → verifies kshana-ink
2. `clean.js` runs → cleans dist directory
3. `install-app-deps.ts` runs → installs deps and copies kshana-ink
4. `build` runs → builds Electron app
5. `electron-builder` runs → packages the app
6. `build:dll` runs → builds DLL files

**Expected output:**
- Verification passes
- Dependencies install without symlinks
- kshana-ink copies successfully
- Electron app builds
- DMG/ZIP files created in `release/build/`

### Step 6: Test Packaged App

1. **Find the packaged app:**
   ```bash
   # macOS
   open release/build/mac/Kshana.app
   
   # Or install from DMG
   open release/build/Kshana-*.dmg
   ```

2. **Verify runtime loading:**
   - Launch the app
   - Check logs for successful kshana-ink loading
   - Verify backend starts correctly
   - Test core functionality

3. **Check logs:**
   ```bash
   # App logs location (macOS)
   ~/Library/Logs/Kshana/main.log
   
   # Look for:
   # - "Resolved node_modules directory: .../app.asar.unpacked/node_modules"
   # - "Found kshana-ink at unpacked location: ..."
   # - "Successfully loaded kshana-ink modules"
   ```

## Troubleshooting Local Testing

### Issue: Verification fails - "kshana-ink not found"
**Solution:** Ensure kshana-ink is at `../kshana-ink` relative to kshana-desktop root.

### Issue: Verification fails - "kshana-ink is not built"
**Solution:** Run `pnpm build` in kshana-ink directory.

### Issue: Copy fails - "kshana-ink source not found"
**Solution:** Check that `release/app/package.json` has correct path (`file:../../../kshana-ink`).

### Issue: Runtime fails - "kshana-ink module not found"
**Solution:** 
- Check that `app.asar.unpacked/node_modules/kshana-ink` exists in packaged app
- Verify `asarUnpack` config in `package.json` includes `**/node_modules/**/*`

## Deployment Guide

### Step 1: Prepare for Deployment

1. **Ensure all changes are committed:**
   ```bash
   cd kshana-desktop
   git status
   git add .
   git commit -m "Update bundling strategy for production"
   git push origin fix/version-2
   ```

2. **Verify kshana-ink is ready:**
   ```bash
   cd ../kshana-ink
   git status
   # Ensure merged-cleanup-fixes branch is up to date
   git push origin merged-cleanup-fixes
   ```

### Step 2: Create GitHub Release Tag

```bash
cd kshana-desktop

# Update version in package.json (if needed)
# Then create and push tag:
git tag v1.0.0  # Use appropriate version number
git push origin v1.0.0
```

**Tag naming convention:**
- `v1.0.0` - Major release
- `v1.0.1` - Patch release
- `v1.1.0` - Minor release

### Step 3: Monitor CI/CD Build

1. **Go to GitHub Actions:**
   ```
   https://github.com/anveshane/kshana-desktop/actions
   ```

2. **Find your workflow run:**
   - Look for workflow triggered by your tag push
   - Click on it to see progress

3. **Watch for these steps:**
   - ✅ Checkout kshana-desktop
   - ✅ Checkout kshana-ink
   - ✅ Build kshana-ink
   - ✅ Verify kshana-ink build
   - ✅ Verify kshana-ink before packaging
   - ✅ Build Electron app
   - ✅ Package and publish

### Step 4: Verify Release

1. **Check GitHub Releases:**
   ```
   https://github.com/anveshane/kshana-desktop/releases
   ```

2. **Download and test:**
   - Download DMG files for macOS
   - Install and test the packaged app
   - Verify all functionality works

### Step 5: Post-Deployment Verification

1. **Check version info:**
   - App should include `.kshana-ink-version.json` with git info
   - Verify correct branch/commit is recorded

2. **Test core features:**
   - Backend starts correctly
   - API endpoints work
   - File operations work
   - Settings persist

## CI/CD Configuration

### Required GitHub Secrets

The workflow uses these secrets (optional, falls back to defaults):

- `KSHANA_INK_REPO_TOKEN` (optional)
  - Personal access token with access to `anveshane/kshana-ink` repo
  - Falls back to `GITHUB_TOKEN` if not set
  - Only needed if kshana-ink repo is private

### Workflow Branches

Current configuration:
- **Frontend:** `fix/version-2` (kshana-desktop)
- **Backend:** `merged-cleanup-fixes` (kshana-ink)

To change branches, edit `.github/workflows/release.yml`:
```yaml
FRONTEND_BRANCH="your-branch-name"
BACKEND_BRANCH="your-backend-branch-name"
```

## Best Practices

1. **Always test locally first** - Don't deploy without local verification
2. **Check verification output** - Ensure all checks pass before packaging
3. **Test packaged app** - Verify runtime behavior matches development
4. **Monitor CI/CD logs** - Watch for errors during build
5. **Test release artifacts** - Download and test DMG files before announcing

## Quick Reference

### Local Testing Commands
```bash
# 1. Build kshana-ink
cd kshana-ink && pnpm build

# 2. Verify kshana-ink
cd ../kshana-desktop
npx ts-node ./.erb/scripts/verify-kshana-ink.ts ../kshana-ink

# 3. Test install script
npx ts-node ./.erb/scripts/install-app-deps.ts

# 4. Full build test
npm run package
```

### Deployment Commands
```bash
# 1. Commit changes
git add . && git commit -m "Your message"
git push origin fix/version-2

# 2. Create release tag
git tag v1.0.0
git push origin v1.0.0

# 3. Monitor at:
# https://github.com/anveshane/kshana-desktop/actions
```

## Need Help?

If you encounter issues:
1. Check logs in `~/Library/Logs/Kshana/main.log`
2. Review CI/CD workflow logs
3. Verify directory structure matches expected layout
4. Ensure both repos are on correct branches
5. Verify kshana-ink is built before packaging

