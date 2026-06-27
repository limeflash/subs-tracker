import { AuthError } from "next-auth";

/** Surface a friendly Russian message for NextAuth errors. */
export function getAuthError(e: unknown): string {
  if (e instanceof AuthError) {
    switch (e.type) {
      case "CredentialsSignin":
        return "Неверный email или пароль";
      case "CallbackRouteError":
        return "Ошибка авторизации. Попробуйте снова.";
      case "AccessDenied":
        return "Доступ запрещён";
      default:
        return `Ошибка авторизации (${e.type})`;
    }
  }
  return "Не удалось войти. Попробуйте снова.";
}