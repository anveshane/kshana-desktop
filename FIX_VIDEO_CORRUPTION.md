# Fix Video File Corruption in Git

## Problem
Videos are getting corrupted when pushed to Git because Git was treating `.mp4` files as text files and applying line ending conversions.

## Solution Applied
Added video file extensions to `.gitattributes` to mark them as binary files.

## Steps to Fix Already Corrupted Files

Run these commands in your terminal:

```bash
cd kshana-desktop

# 1. Remove corrupted video files from Git index (keeps local files)
git rm --cached test_video/*.mp4

# 2. Re-add them so Git treats them as binary (thanks to .gitattributes)
git add test_video/*.mp4

# 3. Verify they're now treated as binary
git ls-files --eol test_video/*.mp4

# 4. Commit the fix
git add .gitattributes
git commit -m "fix: mark video files as binary in .gitattributes to prevent corruption"
```

## Verification

After running the commands, check that files are marked as binary:
- The `git ls-files --eol` command should show `-text` or `binary` for the video files
- The files should no longer get corrupted when pushed/pulled

## Prevention

The `.gitattributes` file now includes:
- `*.mp4   binary`
- `*.webm  binary`
- `*.mov   binary`
- `*.avi   binary`
- `*.mkv   binary`

This ensures all video files are treated as binary and won't be corrupted by Git's text transformations.

