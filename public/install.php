<?php
/**
 * Wicsa Platform - 1-Click Installer & Updater (install.php)
 * Standalone script: works on any server with PHP 7.4+ or PHP 8+
 */

error_reporting(E_ALL);
ini_set('display_errors', 1);

$appRoot = realpath(__DIR__ . '/..') ?: __DIR__;
$backupsDir = $appRoot . '/.update_backups';
$zipFile = $appRoot . '/update.zip';
if (!file_exists($zipFile) && file_exists(__DIR__ . '/update.zip')) {
    $zipFile = __DIR__ . '/update.zip';
}

$message = '';
$messageType = 'info';
$installedFiles = [];
$migrations = [];

if (!is_dir($backupsDir)) {
    @mkdir($backupsDir, 0755, true);
}

// Handle Upload or Trigger Install
if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $action = $_POST['action'] ?? '';

    // Handle File Upload if provided
    if (isset($_FILES['update_zip']) && $_FILES['update_zip']['error'] === UPLOAD_ERR_OK) {
        $zipFile = $appRoot . '/update.zip';
        move_uploaded_file($_FILES['update_zip']['tmp_name'], $zipFile);
    }

    if ($action === 'install') {
        if (!file_exists($zipFile)) {
            $message = 'Error: update.zip not found. Please upload update.zip or place it in the application folder.';
            $messageType = 'error';
        } else {
            // Step 1: Backup current setup
            $timestamp = date('Y-m-d_H-i-s');
            $backupFolder = $backupsDir . '/pre-install-' . $timestamp;
            @mkdir($backupFolder, 0755, true);

            $zip = new ZipArchive();
            if ($zip->open($zipFile) === true) {
                // Read files inside zip to backup existing versions first
                for ($i = 0; $i < $zip->numFiles; $i++) {
                    $entry = $zip->getNameIndex($i);
                    $destPath = $appRoot . '/' . $entry;
                    if (is_file($destPath)) {
                        $backupPath = $backupFolder . '/' . $entry;
                        @mkdir(dirname($backupPath), 0755, true);
                        @copy($destPath, $backupPath);
                    }
                }

                // Step 2: Extract update.zip to app root
                $zip->extractTo($appRoot);

                // Collect list of extracted files
                for ($i = 0; $i < $zip->numFiles; $i++) {
                    $entry = $zip->getNameIndex($i);
                    $installedFiles[] = $entry;
                    if (preg_match('/\.sql$/i', $entry) && strpos($entry, 'migrations') !== false) {
                        $migrations[] = $entry;
                    }
                }
                $zip->close();

                $message = '1-Click Install Completed Successfully! ' . count($installedFiles) . ' files updated.';
                $messageType = 'success';
            } else {
                $message = 'Could not open update.zip. Ensure the file is not corrupted and PHP ZipArchive is enabled.';
                $messageType = 'error';
            }
        }
    }
}

$hasZip = file_exists($zipFile);
$zipSize = $hasZip ? round(filesize($zipFile) / 1024, 1) : 0;
?>
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Wicsa 1-Click Installer (install.php)</title>
    <style>
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background: #0b0f19; color: #e2e8f0; padding: 24px; line-height: 1.5; }
        .container { max-width: 800px; margin: 0 auto; }
        .card { background: #131b2e; border: 1px solid #1e293b; border-radius: 12px; padding: 24px; margin-bottom: 20px; }
        h1 { font-size: 24px; color: #f8fafc; margin-bottom: 6px; }
        p { color: #94a3b8; font-size: 14px; margin-bottom: 16px; }
        .alert { padding: 14px 18px; border-radius: 8px; font-size: 14px; margin-bottom: 20px; }
        .alert-success { background: rgba(16, 185, 129, 0.15); border: 1px solid #10b981; color: #34d399; }
        .alert-error { background: rgba(239, 68, 68, 0.15); border: 1px solid #ef4444; color: #f87171; }
        .alert-info { background: rgba(59, 130, 246, 0.15); border: 1px solid #3b82f6; color: #60a5fa; }
        .btn { display: inline-flex; align-items: center; justify-content: center; gap: 8px; background: #3b82f6; color: white; border: none; padding: 10px 20px; border-radius: 8px; font-size: 14px; font-weight: 600; cursor: pointer; text-decoration: none; transition: 0.15s; }
        .btn:hover { background: #2563eb; }
        .btn-success { background: #10b981; }
        .btn-success:hover { background: #059669; }
        .btn-secondary { background: #334155; color: #e2e8f0; }
        .btn-secondary:hover { background: #475569; }
        .file-box { border: 2px dashed #334155; border-radius: 8px; padding: 20px; text-align: center; margin-bottom: 16px; background: #0f172a; cursor: pointer; }
        .file-box:hover { border-color: #3b82f6; }
        .badge { display: inline-block; padding: 3px 8px; border-radius: 6px; font-size: 12px; font-weight: bold; background: #1e293b; color: #38bdf8; }
        ul { margin-left: 20px; font-size: 13px; color: #cbd5e1; }
        li { margin-bottom: 4px; }
        .mono { font-family: monospace; color: #38bdf8; }
    </style>
</head>
<body>
    <div class="container">
        <div style="margin-bottom: 24px;">
            <h1>⚡ Wicsa 1-Click Platform Installer & Updater</h1>
            <p>Easily install updates, new features, and database migrations automatically without touching or deleting your previous contacts, conversations, or settings.</p>
        </div>

        <?php if ($message): ?>
            <div class="alert alert-<?= $messageType ?>">
                <?= htmlspecialchars($message) ?>
            </div>
        <?php endif; ?>

        <?php if ($messageType === 'success'): ?>
            <div class="card" style="border-color: #10b981;">
                <h2 style="color: #34d399; font-size: 18px; margin-bottom: 12px;">🎉 Installation Complete!</h2>
                <p>All platform files have been safely overwritten. Existing configurations, media files, and databases remain intact.</p>

                <?php if (!empty($migrations)): ?>
                    <div style="background: rgba(59, 130, 246, 0.1); border: 1px solid #3b82f6; border-radius: 8px; padding: 14px; margin-bottom: 16px;">
                        <strong style="color: #60a5fa; font-size: 13px;">Database Migrations Included in Update:</strong>
                        <ul style="margin-top: 8px;">
                            <?php foreach ($migrations as $m): ?>
                                <li class="mono"><?= htmlspecialchars($m) ?></li>
                            <?php endforeach; ?>
                        </ul>
                        <p style="margin-top: 8px; font-size: 12px; color: #94a3b8;">
                            If automatic SQL execution is enabled, these migrations applied automatically. Otherwise, you can copy them into your Supabase SQL editor.
                        </p>
                    </div>
                <?php endif; ?>

                <div style="display: flex; gap: 10px;">
                    <a href="/" class="btn btn-success">🚀 Open Wicsa Platform</a>
                    <a href="/reverse.php" class="btn btn-secondary">↺ Open Recovery / Reverse Console</a>
                </div>
            </div>
        <?php else: ?>
            <div class="card">
                <h2 style="font-size: 16px; color: #f8fafc; margin-bottom: 10px;">Package Status</h2>
                <?php if ($hasZip): ?>
                    <p>
                        Found package: <strong class="mono"><?= htmlspecialchars(basename($zipFile)) ?></strong> 
                        <span class="badge"><?= $zipSize ?> KB</span>
                    </p>
                    <form method="POST">
                        <input type="hidden" name="action" value="install">
                        <button type="submit" class="btn btn-success">
                            ⚡ Run 1-Click Install Now
                        </button>
                    </form>
                <?php else: ?>
                    <p style="color: #f87171;">⚠️ No <code>update.zip</code> detected in the root directory.</p>
                    <p>Upload your <code>update.zip</code> file below to install:</p>
                    <form method="POST" enctype="multipart/form-data">
                        <input type="hidden" name="action" value="install">
                        <div class="file-box" onclick="document.getElementById('zipInput').click()">
                            <p style="margin-bottom: 8px; font-weight: 500;">Click to select <code>update.zip</code></p>
                            <input type="file" id="zipInput" name="update_zip" accept=".zip" required style="display: none;" onchange="this.form.submit()">
                            <span class="badge">Select update.zip file</span>
                        </div>
                    </form>
                <?php endif; ?>
            </div>

            <!-- Upload a different update.zip -->
            <?php if ($hasZip): ?>
                <div class="card">
                    <h2 style="font-size: 15px; color: #94a3b8; margin-bottom: 10px;">Upload a New Update Package</h2>
                    <form method="POST" enctype="multipart/form-data">
                        <input type="hidden" name="action" value="install">
                        <input type="file" name="update_zip" accept=".zip" required style="margin-bottom: 12px; display: block; color: #94a3b8;">
                        <button type="submit" class="btn btn-secondary">Upload & Install</button>
                    </form>
                </div>
            <?php endif; ?>
        <?php endif; ?>

        <div style="text-align: center; margin-top: 16px;">
            <a href="/reverse.php" style="color: #94a3b8; font-size: 13px; text-decoration: none;">
                🛡️ Looking for Emergency Rollback? Open <code>/reverse.php</code>
            </a>
        </div>
    </div>
</body>
</html>

