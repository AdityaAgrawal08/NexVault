import { AppError } from "../../shared/errors/app-error";

export type UserRole = "ADMIN" | "MANAGER" | "USER";

export interface PolicyUser {
  id: string;
  role: string;
}

class PolicyEngine {
  /**
   * Evaluates if a user is authorized to perform an action on a resource.
   */
  public can(
    user: PolicyUser,
    action: string,
    resourceOwnerId?: string
  ): boolean {
    // 1. Role-Based Access Control (RBAC) - Admins bypass all ownership checks
    if (user.role === "ADMIN") {
      return true;
    }

    // 2. Attribute-Based Access Control (ABAC) / Ownership checks
    switch (action) {
      case "view_profile":
      case "update_profile":
      case "delete_profile":
      case "view_sessions":
      case "manage_sessions":
      case "revoke_session":
        // Users can only view/manage their own resources
        return !!resourceOwnerId && user.id === resourceOwnerId;

      case "view_audit_logs":
        // Only Admins or Managers can view general audit logs
        return user.role === "ADMIN" || user.role === "MANAGER";

      default:
        return false;
    }
  }

  /**
   * Asserts authorization. Throws a 403 Forbidden error if not authorized.
   */
  public check(
    user: PolicyUser,
    action: string,
    resourceOwnerId?: string
  ): void {
    if (!this.can(user, action, resourceOwnerId)) {
      throw new AppError({
        message: "You are not authorized to perform this action.",
        statusCode: 403,
        code: "AUTH_FORBIDDEN",
      });
    }
  }
}

export const policyEngine = new PolicyEngine();
export type { PolicyEngine };
