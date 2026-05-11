import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import OrcaButton from "../../../../shared/components/OrcaButton";
import OrcaCard from "../../../../shared/components/OrcaCard";
import OrcaInput from "../../../../shared/components/OrcaInput";
import { forgotPassword } from "../../../../shared/firebase/auth";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const navigate = useNavigate();

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setStatus(null);
    setError(null);
    setSubmitting(true);
    try {
      await forgotPassword(email.trim());
      setStatus("Password reset link sent. Check your email.");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to send reset email");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-50 flex items-center justify-center p-4">
      <OrcaCard className="w-full max-w-md p-6">
        <div className="mb-5">
          <div className="text-2xl font-bold tracking-tight">
            Reset password
          </div>
          <div className="mt-1 text-sm text-white/70">
            Enter your email and we will send a reset link.
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

          {status ? (
            <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-200">
              {status}
            </div>
          ) : null}
          {error ? (
            <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-sm text-rose-200">
              {error}
            </div>
          ) : null}

          <OrcaButton type="submit" disabled={submitting} className="w-full">
            {submitting ? "Sending..." : "Send reset link"}
          </OrcaButton>

          <div className="flex items-center justify-between text-sm text-white/70">
            <button
              type="button"
              className="hover:text-white"
              onClick={() => navigate("/login")}
            >
              Back to login
            </button>
            <Link to="/login" className="hover:text-white">
              ORCA CRM
            </Link>
          </div>
        </form>
      </OrcaCard>
    </div>
  );
}
