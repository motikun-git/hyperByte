<?php
declare(strict_types=1);
defined('HB_API') || exit;

// A simple record of important admin changes (Admin -> Activity).
final class ActivityLog
{
    public static function add(?array $admin, string $action, string $entity = '', ?int $entityId = null, string $summary = ''): void
    {
        try {
            Db::insert('activity_log', [
                'admin_id' => $admin ? (int) $admin['id'] : null,
                'admin_name' => $admin ? mb_substr((string) $admin['name'], 0, 80) : '',
                'action' => mb_substr($action, 0, 40),
                'entity' => mb_substr($entity, 0, 30),
                'entity_id' => $entityId,
                'summary' => mb_substr($summary, 0, 300),
                'ip' => Util::clientIp(),
                'created_at' => Db::now(),
            ]);
        } catch (Throwable $e) {
            error_log('Activity log failed: ' . $e->getMessage());
        }
    }
}
