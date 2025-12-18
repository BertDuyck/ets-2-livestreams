# Release Process

This document describes how to create and publish releases for Dukes ETS Editor.

## Prerequisites

1. **GitHub Token**: You need a GitHub Personal Access Token with `repo` permissions
2. **Git Tag**: Releases are created from git tags (e.g., `v1.0.0`)

## Quick Release Steps

### 1. Set GitHub Token (One-time per session)

In PowerShell, set the token as an environment variable:

```powershell
$env:GH_TOKEN = "your_github_token_here"
$env:GITHUB_TOKEN = "your_github_token_here"
```

**Note**: This only lasts for the current PowerShell session. To make it permanent:
- Add `GH_TOKEN` to Windows Environment Variables (System Properties → Environment Variables)

### 2. Update Version (if needed)

Update the version in `package.json`:

```json
{
  "version": "1.0.1"
}
```

### 3. Create Git Tag and Release

```bash
# Create and push the tag
git tag v1.0.1
git push origin v1.0.1

# Build and publish to GitHub
npm run release
```

That's it! The release will be created automatically on GitHub.

## What Gets Created

The release process creates:

1. **Windows Installer**: `Dukes ETS Editor Setup 1.0.1.exe`
   - Combined installer for both x64 and 32-bit
   - NSIS installer with custom installation directory option

2. **Portable x64**: `Dukes-ETS-Editor-1.0.1-win.zip`
   - Extract and run `Dukes ETS Editor.exe`

3. **Portable 32-bit**: `Dukes-ETS-Editor-1.0.1-ia32-win.zip`
   - Extract and run `Dukes ETS Editor.exe`

4. **Auto-update files**: `latest.yml` and blockmap files
   - Used for automatic updates

All files are automatically uploaded to the GitHub release.

## Build Only (No Release)

If you just want to build without publishing:

```bash
npm run build
```

Files will be created in the `dist/` directory but not uploaded to GitHub.

## Release Workflow Summary

```
1. Set GH_TOKEN environment variable
2. Update version in package.json (if needed)
3. Commit changes
4. Create git tag: git tag v1.0.1
5. Push tag: git push origin v1.0.1
6. Run: npm run release
7. Done! Check GitHub releases page
```

## Troubleshooting

### "Token not set" error
- Make sure `GH_TOKEN` or `GITHUB_TOKEN` is set in your current PowerShell session
- Run: `$env:GH_TOKEN = "your_token"`

### "ng is not recognized"
- Make sure client dependencies are installed: `cd client && npm install`

### Release already exists
- Electron-builder will overwrite existing files if the tag already exists
- To create a new release, use a new version number and tag

## Configuration

The release configuration is in `package.json`:

- **Build targets**: `dir`, `nsis`, `zip` (creates unpacked dir, installer, and zip files)
- **Publish provider**: GitHub (`BertDuyck/ets-2-livestreams`)
- **Architectures**: x64 and ia32 (32-bit)

## GitHub Actions (Automatic)

When you push a tag matching `v*`, GitHub Actions will automatically:
1. Build the application
2. Create a release
3. Upload all artifacts

See `.github/workflows/release.yml` for details.

