import { prisma } from "@/lib/db";

export type AuditAction =
  | "LOGIN_OK"
  | "LOGIN_BAD_PASS"
  | "LOGIN_2FA_FAIL"
  | "LOGIN_2FA_OK"
  | "LOGIN_BACKUP_USED"
  | "2FA_ENABLE"
  | "2FA_DISABLE"
  | "SUBSCRIPTION_CREATE"
  | "SUBSCRIPTION_UPDATE"
  | "SUBSCRIPTION_DELETE"
  | "PAYROLL_CREATE"
  | "PAYROLL_DELETE"
  | "EMPLOYEE_CREATE"
  | "EMPLOYEE_UPDATE"
  | "EMPLOYEE_DELETE"
  | "GROUP_CREATE"
  | "GROUP_UPDATE"
  | "GROUP_DELETE"
  | "CURRENCY_UPDATE"
  | "TELEGRAM_UPDATE"
  | "PROFILE_UPDATE";

/** Append an audit entry. Errors are swallowed — audit must never break the request. */
export async function audit(
  action: AuditAction,
  opts: { meta?: Record<string, unknown>; ip?: string | null; entity?: string } = {},
) {
  try {
    await prisma.auditLog.create({
      data: {
        action,
        entity: opts.entity ?? null,
        meta: (opts.meta ?? null) as never,
        ip: opts.ip ?? null,
      },
    });
  } catch (e) {
    console.error("audit log failure:", e);
  }
}