"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

export default function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const nextPath = searchParams.get("next") || "/";

  const [login, setLogin] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState<"password" | "viewer" | null>(null);
  const [namedUsers, setNamedUsers] = useState<boolean | null>(null);

  useEffect(() => {
    let alive = true;
    fetch("/api/auth/config", { cache: "no-store" })
      .then((r) => r.json())
      .then((d: { namedUsers?: boolean }) => {
        if (alive) setNamedUsers(d.namedUsers === true);
      })
      .catch(() => {
        if (alive) setNamedUsers(false);
      });
    return () => {
      alive = false;
    };
  }, []);

  const goNext = () => {
    router.replace(nextPath.startsWith("/") ? nextPath : "/");
    router.refresh();
  };

  const postLogin = async (body: Record<string, unknown>) => {
    const res = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    if (!res.ok) {
      setError(data.error ?? "Não foi possível entrar");
      return false;
    }
    setError(null);
    return true;
  };

  const onSubmitPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading("password");
    setError(null);
    try {
      const body = namedUsers ? { login, password } : { password };
      if (await postLogin(body)) goNext();
    } finally {
      setLoading(null);
    }
  };

  const onViewer = async () => {
    setLoading("viewer");
    setError(null);
    try {
      if (await postLogin({ asViewer: true })) goNext();
    } finally {
      setLoading(null);
    }
  };

  return (
    <div className="login-screen">
      <div className="login-card">
        <div className="login-brand">
          <Image
            src="/three-tower-logo.png"
            alt=""
            width={56}
            height={56}
            className="login-logo-mark"
            priority
          />
          <div>
            <h1 className="login-title">
              Three <span>Tower</span>
            </h1>
            <p className="login-sub">Inicie sessão para continuar</p>
          </div>
        </div>

        <form className="login-form" onSubmit={onSubmitPassword}>
          {namedUsers ? (
            <>
              <label className="login-label" htmlFor="login-user">
                Utilizador
              </label>
              <input
                id="login-user"
                type="text"
                autoComplete="username"
                className="login-input"
                value={login}
                onChange={(e) => setLogin(e.target.value)}
                placeholder="ex.: pedro, lariele"
                disabled={loading !== null}
              />
            </>
          ) : null}
          <label className="login-label" htmlFor="login-password">
            {namedUsers ? "Palavra-passe" : "Palavra-passe (gestor)"}
          </label>
          <input
            id="login-password"
            type="password"
            autoComplete={namedUsers ? "current-password" : "current-password"}
            className="login-input"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
            disabled={loading !== null}
          />
          <button type="submit" className="login-btn login-btn-primary" disabled={loading !== null || namedUsers === null}>
            {loading === "password" ? "A entrar…" : namedUsers ? "Entrar" : "Entrar com palavra-passe"}
          </button>
        </form>

        <div className="login-divider">
          <span>ou</span>
        </div>

        <button
          type="button"
          className="login-btn login-btn-secondary"
          onClick={onViewer}
          disabled={loading !== null}
        >
          {loading === "viewer" ? "A abrir…" : "Acessar como visualizador"}
        </button>
        <p className="login-hint">Visualizador: consulta sem alterar dados.</p>

        {error ? <p className="login-error">{error}</p> : null}
      </div>
    </div>
  );
}
