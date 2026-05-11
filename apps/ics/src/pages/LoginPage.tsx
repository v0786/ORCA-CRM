import { useEffect, useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import OrcaButton from "../../../../shared/components/OrcaButton";
import OrcaInput from "../../../../shared/components/OrcaInput";
import OrcaCard from "../../../../shared/components/OrcaCard";
import RestaurantLogo from "../../../../shared/components/RestaurantLogo";
import { loginWithEmailAndRestaurantCode } from "../../../../shared/firebase/auth";
import { useAuth } from "../../../../shared/hooks/useAuth";

export default function LoginPage() {
  const auth = useAuth();
  const navigate = useNavigate();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [restaurantCode, setRestaurantCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (auth.status === "authenticated") navigate("/");
  }, [auth.status, navigate]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await loginWithEmailAndRestaurantCode(email.trim(), password, restaurantCode.trim());
      navigate("/");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Login failed");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-50 flex items-center justify-center p-4">
      <OrcaCard className="w-full max-w-md p-6">
        <div className="mb-5">
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="text-2xl font-bold tracking-tight">
                ORCA CRM <span className="text-orange-500">ICS</span>
              </div>
              <div className="mt-1 text-sm text-white/70">
                Operational dashboard & POS
              </div>
            </div>
            <RestaurantLogo size={42} editable={false} />
          </div>
        </div>

        <form className="space-y-4" onSubmit={onSubmit}>
          <OrcaInput
            label="Email"
            type="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
          <OrcaInput
            label="Password"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
          <OrcaInput
            label="Restaurant code"
            type="text"
            autoComplete="organization"
            value={restaurantCode}
            onChange={(e) => setRestaurantCode(e.target.value)}
            required
          />

          {error ? (
            <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-sm text-rose-200">
              {error}
            </div>
          ) : null}

          <OrcaButton type="submit" disabled={submitting} className="w-full">
            {submitting ? "Signing in..." : "Login"}
          </OrcaButton>

          <div className="flex items-center justify-between text-sm text-white/70">
            <Link to="/forgot-password" className="hover:text-white">
              Forgot password?
            </Link>
            <Link to="/login" className="hover:text-white/90">
              Refresh
            </Link>
          </div>
        </form>
      </OrcaCard>
    </div>
  );
}
