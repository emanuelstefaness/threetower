import { Suspense } from "react";
import LoginForm from "@/features/auth/LoginForm";

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <div className="login-screen">
          <div className="login-card login-card--loading">A carregar…</div>
        </div>
      }
    >
      <LoginForm />
    </Suspense>
  );
}
