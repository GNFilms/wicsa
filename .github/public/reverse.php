<?php
/**
 * Wicsa Platform - Emergency Disaster Recovery & Restore Console
 * Standalone script: works independently of Next.js / Node.js
 */

error_reporting(E_ALL);
ini_set('display_errors', 1);

// Application root
$appRoot = realpath(__DIR__ . '/..') ?: __DIR__;
$backupsDir = $appRoot . '/.update_backups';
$historyFile = $backupsDir . '/history.json';
$errorLogFile = $backupsDir . '/error.log';

if (!is_dir($backupsDir)) {
    @mkdir($backupsDir, 0755, true);
}

// Security key (optional, default: wicsa-restore)
$securityKey = getenv('RECOVERY_PIN') ?: 'wicsa-restore';

$action = $_POST['action'] ?? $_GET['action'] ?? '';
$pin = $_POST['pin'] ?? $_GET['pin'] ?? '';
$message = '';
$messageType = 'info';

// Check PIN for destructive actions
$authorized = ($pin === $securityKey);

// ============================================================
// Actions
// ============================================================

// 1. Create On-Demand Backup
if ($action === 'backup' && $authorized) {
    $timestamp = date('Y-m-d_H-i-s');
    $backupFolder = $backupsDir . '/manual-backup-' . $timestamp;
    @mkdir($backupFolder, 0755, true);

    $filesToBackup = ['src', 'messages', 'supabase', 'package.json', 'all_migrations_combined.sql'];
    $count = 0;

    foreach ($filesToBackup as $item) {
        $srcPath = $appRoot . '/' . $item;
        $destPath = $backupFolder . '/' . $item;
        if (is_dir($srcPath)) {
            $count += copyDirRecursive($srcPath, $destPath);
        } elseif (is_file($srcPath)) {
            @mkdir(dirname($destPath), 0755, true);
            if (@copy($srcPath, $destPath)) $count++;
        }
    }

    $history = file_exists($historyFile) ? json_decode(file_get_contents($historyFile), true) : [];
    if (!is_array($history)) $history = [];
    $history[] = [
        'installedAt' => date('c'),
        'installedBy' => 'manual-backup',
        'filesCount' => $count,
        'backedUpCount' => $count,
        'backupPath' => $backupFolder,
        'type' => 'manual',
    ];
    file_put_contents($historyFile, json_encode($history, JSON_PRETTY_PRINT));

    $message = "Manual backup successfully created! ($count files saved to " . basename($backupFolder) . ")";
    $messageType = 'success';
}

// 2. Restore Backup
if ($action === 'restore' && $authorized) {
    $targetBackup = $_POST['backup_name'] ?? '';
    $backupPath = $backupsDir . '/' . basename($targetBackup);

    if ($targetBackup && is_dir($backupPath)) {
        $restored = copyDirRecursive($backupPath, $appRoot);
        $message = "Restoration completed! $restored files were reverted to the version from " . htmlspecialchars($targetBackup) . ".";
        $messageType = 'success';
    } else {
        $message = "Selected backup directory not found.";
        $messageType = 'error';
    }
}

// Helper: copy directory recursively
function copyDirRecursive($src, $dst) {
    $count = 0;
    $dir = @opendir($src);
    if (!$dir) return 0;
    @mkdir($dst, 0755, true);
    while (false !== ($file = readdir($dir))) {
        if ($file !== '.' && $file !== '..') {
            $srcFile = $src . '/' . $file;
            $dstFile = $dst . '/' . $file;
            if (is_dir($srcFile)) {
                $count += copyDirRecursive($srcFile, $dstFile);
            } else {
                if (@copy($srcFile, $dstFile)) $count++;
            }
        }
    }
    closedir($dir);
    return $count;
}

// Read Backups
$backups = [];
if (is_dir($backupsDir)) {
    $scan = scandir($backupsDir);
    foreach ($scan as $folder) {
        if ($folder !== '.' && $folder !== '..' && is_dir($backupsDir . '/' . $folder)) {
            $backups[] = [
                'name' => $folder,
                'time' => date('Y-m-d H:i:s', filemtime($backupsDir . '/' . $folder)),
            ];
        }
    }
}
usort($backups, function ($a, $b) {
    return strcmp($b['name'], $a['name']);
});

// Read Error Logs
$errorLog = '';
if (file_exists($errorLogFile)) {
    $errorLog = file_get_contents($errorLogFile);
}
if (!$errorLog && file_exists($historyFile)) {
    $hist = json_decode(file_get_contents($historyFile), true);
    if (is_array($hist)) {
        $last = end($hist);
        if (!empty($last['migrationsFailed'])) {
            $errorLog = json_encode($last['migrationsFailed'], JSON_PRETTY_PRINT);
        }
    }
}
?>
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Wicsa Disaster Recovery & Restore Console</title>
    <style>
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background: #0b0f19; color: #e2e8f0; padding: 24px; line-height: 1.5; }
        .container { max-width: 900px; margin: 0 auto; }
        .card { background: #131b2e; border: 1px solid #1e293b; border-radius: 12px; padding: 20px; margin-bottom: 20px; }
        h1 { font-size: 24px; color: #f8fafc; margin-bottom: 6px; }
        h2 { font-size: 16px; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 12px; }
        p { color: #94a3b8; font-size: 14px; margin-bottom: 12px; }
        .alert { padding: 12px 16px; border-radius: 8px; font-size: 14px; margin-bottom: 16px; }
        .alert-success { background: rgba(16, 185, 129, 0.15); border: 1px solid #10b981; color: #34d399; }
        .alert-error { background: rgba(239, 68, 68, 0.15); border: 1px solid #ef4444; color: #f87171; }
        .alert-info { background: rgba(59, 130, 246, 0.15); border: 1px solid #3b82f6; color: #60a5fa; }
        input[type="text"], input[type="password"] { background: #1e293b; border: 1px solid #334155; color: #f8fafc; padding: 8px 12px; border-radius: 6px; font-size: 14px; width: 100%; max-width: 320px; }
        .btn { display: inline-flex; align-items: center; justify-content: center; gap: 8px; background: #3b82f6; color: white; border: none; padding: 9px 16px; border-radius: 6px; font-size: 13px; font-weight: 600; cursor: pointer; text-decoration: none; transition: 0.15s; }
        .btn:hover { background: #2563eb; }
        .btn-danger { background: #ef4444; }
        .btn-danger:hover { background: #dc2626; }
        .btn-secondary { background: #334155; color: #e2e8f0; }
        .btn-secondary:hover { background: #475569; }
        table { width: 100%; border-collapse: collapse; font-size: 13px; margin-top: 10px; }
        th, td { text-align: left; padding: 10px 12px; border-bottom: 1px solid #1e293b; }
        th { color: #64748b; font-weight: 600; }
        pre { background: #050811; border: 1px solid #1e293b; border-radius: 8px; padding: 12px; color: #f87171; font-family: monospace; font-size: 12px; max-height: 240px; overflow: auto; white-space: pre-wrap; }
        .badge { display: inline-block; padding: 2px 8px; border-radius: 999px; font-size: 11px; font-weight: bold; background: #334155; color: #94a3b8; }
        .badge-green { background: rgba(16, 185, 129, 0.2); color: #34d399; }
    </style>
</head>
<body>
    <div class="container">
        <div style="margin-bottom: 24px;">
            <h1>🛡️ Wicsa Emergency Disaster Recovery & Restore</h1>
            <p>Standalone emergency console to review error reports, create backups, or rollback the platform if an update caused an issue.</p>
        </div>

        <?php if ($message): ?>
            <div class="alert alert-<?= $messageType ?>">
                <?= htmlspecialchars($message) ?>
            </div>
        <?php endif; ?>

        <!-- Security PIN Form -->
        <div class="card">
            <h2>Authentication</h2>
            <form method="GET" style="display: flex; gap: 8px; align-items: center; flex-wrap: wrap;">
                <input type="password" name="pin" value="<?= htmlspecialchars($pin) ?>" placeholder="Enter Recovery PIN (default: wicsa-restore)">
                <button type="submit" class="btn btn-secondary">Unlock Actions</button>
                <?php if ($authorized): ?>
                    <span class="badge badge-green">✓ Authorized</span>
                <?php else: ?>
                    <span class="badge">Read-only mode</span>
                <?php endif; ?>
            </form>
        </div>

        <!-- Error Reports -->
        <?php if ($errorLog): ?>
            <div class="card" style="border-color: #ef4444;">
                <h2 style="color: #f87171;">⚠️ Latest System / Update Error Report</h2>
                <pre><?= htmlspecialchars($errorLog) ?></pre>
            </div>
        <?php endif; ?>

        <!-- Actions -->
        <div class="card">
            <h2>Instant Backup</h2>
            <p>Take a complete on-demand backup snapshot of all code, components, and migrations right now.</p>
            <form method="POST">
                <input type="hidden" name="action" value="backup">
                <input type="hidden" name="pin" value="<?= htmlspecialchars($pin) ?>">
                <button type="submit" class="btn" <?= !$authorized ? 'disabled style="opacity:0.5;cursor:not-allowed;"' : '' ?>>
                    📦 Create Instant Backup Snapshot
                </button>
            </form>
        </div>

        <!-- Available Backups Table -->
        <div class="card">
            <h2>Available Restore Points (<?= count($backups) ?>)</h2>
            <p>Select any backup to restore files to that exact previous state.</p>
            <?php if (empty($backups)): ?>
                <p style="color: #64748b;">No backups found in <code>.update_backups/</code>.</p>
            <?php else: ?>
                <table>
                    <thead>
                        <tr>
                            <th>Backup Name</th>
                            <th>Date Created</th>
                            <th style="text-align: right;">Action</th>
                        </tr>
                    </thead>
                    <tbody>
                        <?php foreach ($backups as $b): ?>
                            <tr>
                                <td style="font-family: monospace; color: #f8fafc;">
                                    <?= htmlspecialchars($b['name']) ?>
                                </td>
                                <td style="color: #94a3b8;">
                                    <?= htmlspecialchars($b['time']) ?>
                                </td>
                                <td style="text-align: right;">
                                    <form method="POST" style="display: inline;" onsubmit="return confirm('Are you sure you want to restore this backup? This will overwrite existing files with this version.');">
                                        <input type="hidden" name="action" value="restore">
                                        <input type="hidden" name="backup_name" value="<?= htmlspecialchars($b['name']) ?>">
                                        <input type="hidden" name="pin" value="<?= htmlspecialchars($pin) ?>">
                                        <button type="submit" class="btn btn-danger" style="padding: 4px 10px; font-size: 11px;" <?= !$authorized ? 'disabled style="opacity:0.5;cursor:not-allowed;"' : '' ?>>
                                            ↺ Restore Version
                                        </button>
                                    </form>
                                </td>
                            </tr>
                        <?php endforeach; ?>
                    </tbody>
                </table>
            <?php endif; ?>
        </div>

        <!-- Return Link -->
        <div style="text-align: center; margin-top: 16px;">
            <a href="/" class="btn btn-secondary">← Back to Wicsa Dashboard</a>
        </div>
    </div>
</body>
</html>
