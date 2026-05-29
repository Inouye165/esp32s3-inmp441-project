# Data Directory

This directory contains runtime data for the ESP module management system.

## ⚠️ IMPORTANT: Do Not Manually Edit

**DO NOT manually edit `modules.json` directly!** 

- The file is managed by the application
- Manual edits can cause data loss or corruption
- Use the web interface or API endpoints to update module data

## Automatic Backups

The system now automatically creates backups before each save:

- **Location**: `backups/` subdirectory
- **Format**: `modules-YYYY-MM-DDTHH-MM-SS.json`
- **Retention**: Last 10 backups are kept
- **Automatic cleanup**: Old backups are automatically deleted

## Data Recovery

If you lose data, check the `backups/` folder for recent backups.

To restore a backup:
1. Stop the server
2. Copy the desired backup file to `modules.json`
3. Restart the server

## Files

- `modules.json` - Current module registry (managed by app)
- `backups/` - Timestamped automatic backups

## Version Control

This directory is intentionally **not tracked by git** because it contains runtime data that changes frequently. The backup system provides recovery capabilities without polluting git history.
