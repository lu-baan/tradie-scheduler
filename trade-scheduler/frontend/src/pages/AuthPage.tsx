import { useState } from "react";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";
import { Loader2, Eye, EyeOff, ArrowLeft, Sun, Moon } from "lucide-react";
import type { UserRole } from "@/App";

// ── Schemas ──────────────────────────────────────────────────────────────────

const loginSchema = z.object({
  loginNumber: z
    .string()
    .length(6, "Enter your 6-digit login number")
    .regex(/^\d{6}$/, "Must be 6 digits"),
  password: z.string().min(6, "Password must be at least 6 characters"),
});

const forgotSchema = z.object({
  email: z.string().email("Enter a valid email address"),
});

// ── Label helper ──────────────────────────────────────────────────────────────

function Label({ children, required = false }: { children: React.ReactNode; required?: boolean }) {
  return (
    <label className="text-xs uppercase text-muted-foreground font-display mb-1 block">
      {children}
      {required && <span className="text-destructive ml-0.5">*</span>}
    </label>
  );
}

// ── Component ─────────────────────────────────────────────────────────────────

export function AuthPage({ onLogin, theme, onToggleTheme }: { onLogin: (role: UserRole) => void; theme: "dark" | "light"; onToggleTheme: () => void }) {
  const [view, setView] = useState<"login" | "forgot">("login");
  const [showPassword, setShowPassword] = useState(false);
  const [isPending, setIsPending] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const [forgotSuccess, setForgotSuccess] = useState(false);

  const loginForm = useForm<z.infer<typeof loginSchema>>({
    resolver: zodResolver(loginSchema),
    defaultValues: { loginNumber: "", password: "" },
  });

  const forgotForm = useForm<z.infer<typeof forgotSchema>>({
    resolver: zodResolver(forgotSchema),
    defaultValues: { email: "" },
  });

  const handleLogin = async (data: z.infer<typeof loginSchema>) => {
    setIsPending(true);
    setServerError(null);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ loginNumber: data.loginNumber, password: data.password }),
      });
      if (!res.ok) {
        const text = await res.text();
        let msg = "Login failed — please try again.";
        try { msg = JSON.parse(text).error || msg; } catch {}
        throw new Error(msg);
      }
      const user = await res.json();
      sessionStorage.setItem("ts2_worker_id", String(user.workerId ?? ""));
      sessionStorage.setItem("ts2_full_name", user.fullName ?? "");
      sessionStorage.setItem("ts2_login_number", user.loginNumber ?? "");
      sessionStorage.setItem("ts2_email", user.email ?? "");
      onLogin(user.role as UserRole);
    } catch (err: any) {
      setServerError(err.message || "Login failed. Please check your credentials.");
    } finally {
      setIsPending(false);
    }
  };

  const handleForgot = async (data: z.infer<typeof forgotSchema>) => {
    setIsPending(true);
    setServerError(null);
    try {
      // TODO: Replace with actual reset API call
      await new Promise(r => setTimeout(r, 600));
      setForgotSuccess(true);
    } catch (err: any) {
      setServerError(err.message || "Could not send reset email.");
    } finally {
      setIsPending(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <button
        type="button"
        onClick={onToggleTheme}
        className="fixed top-4 right-4 p-2 rounded-lg bg-card border border-border text-muted-foreground hover:text-foreground transition-colors"
        title={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
      >
        {theme === "dark" ? <Sun size={18} /> : <Moon size={18} />}
      </button>
      <div className="w-full max-w-md">
        {/* Brand Header */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center gap-3 mb-4">
            <div className="w-12 h-12 rounded-lg bg-primary flex items-center justify-center text-black font-display font-bold text-2xl shadow-[0_0_30px_rgba(234,88,12,0.5)]">
              TS2
            </div>
            <div className="text-left">
              <h1 className="font-display font-bold text-3xl leading-none text-foreground">TRADE</h1>
              <p className="font-display text-primary text-sm font-semibold tracking-widest">SCHEDULER 2</p>
            </div>
          </div>
        </div>

        {/* LOGIN VIEW */}
        {view === "login" && (
          <Card className="p-8 bg-card border-white/5 shadow-2xl animate-in fade-in slide-in-from-bottom-4 duration-300">
            <h2 className="font-display text-2xl font-bold text-foreground mb-1">Welcome back</h2>
            <p className="text-muted-foreground text-sm mb-6">Enter your login number to continue.</p>

            {serverError && (
              <div className="bg-destructive/10 border border-destructive/30 text-destructive text-sm rounded-lg p-3 mb-4">
                {serverError}
              </div>
            )}

            <form onSubmit={loginForm.handleSubmit(handleLogin)} className="space-y-6">
              <div>
                <Label required>Login Number</Label>
                <div className="flex justify-center mt-2">
                  <Controller
                    name="loginNumber"
                    control={loginForm.control}
                    render={({ field }) => (
                      <InputOTP
                        maxLength={6}
                        value={field.value}
                        onChange={field.onChange}
                        inputMode="numeric"
                        pattern="[0-9]*"
                      >
                        <InputOTPGroup>
                          {[0, 1, 2, 3, 4, 5].map(i => (
                            <InputOTPSlot
                              key={i}
                              index={i}
                              className="h-14 w-12 text-xl font-bold font-mono"
                            />
                          ))}
                        </InputOTPGroup>
                      </InputOTP>
                    )}
                  />
                </div>
                {loginForm.formState.errors.loginNumber && (
                  <p className="text-destructive text-sm mt-2 text-center">
                    {loginForm.formState.errors.loginNumber.message}
                  </p>
                )}
                <p className="text-center text-[11px] text-muted-foreground mt-2">
                  Demo: <span className="font-mono text-primary">1xxxxx</span> = admin &nbsp;·&nbsp;
                  <span className="font-mono text-primary">2xxxxx</span> = worker
                </p>
              </div>

              <div>
                <Label required>Password</Label>
                <div className="relative">
                  <Input
                    type={showPassword ? "text" : "password"}
                    {...loginForm.register("password")}
                    className="pr-10"
                    placeholder="••••••••"
                  />
                  <button
                    type="button"
                    className="absolute right-3 top-3 text-muted-foreground hover:text-foreground transition-colors"
                    onClick={() => setShowPassword(p => !p)}
                    tabIndex={-1}
                  >
                    {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </div>
                {loginForm.formState.errors.password && (
                  <p className="text-destructive text-sm mt-1">{loginForm.formState.errors.password.message}</p>
                )}
              </div>

              <div className="flex justify-end -mt-2">
                <button
                  type="button"
                  className="text-sm text-primary hover:underline"
                  onClick={() => { setView("forgot"); setServerError(null); }}
                >
                  Forgot password?
                </button>
              </div>

              <Button
                type="submit"
                disabled={isPending}
                className="w-full h-12 text-base font-bold shadow-[0_0_20px_rgba(234,88,12,0.4)]"
              >
                {isPending ? <Loader2 className="animate-spin w-5 h-5" /> : "Sign In"}
              </Button>
            </form>
          </Card>
        )}

        {/* FORGOT PASSWORD VIEW */}
        {view === "forgot" && (
          <Card className="p-8 bg-card border-white/5 shadow-2xl animate-in fade-in slide-in-from-bottom-4 duration-300">
            <button
              className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground mb-4"
              onClick={() => { setView("login"); setServerError(null); setForgotSuccess(false); }}
            >
              <ArrowLeft size={14} /> Back to login
            </button>

            <h2 className="font-display text-2xl font-bold text-foreground mb-1">Reset Password</h2>
            <p className="text-muted-foreground text-sm mb-6">
              Enter your email and we'll send a link to reset your password.
            </p>

            {serverError && (
              <div className="bg-destructive/10 border border-destructive/30 text-destructive text-sm rounded-lg p-3 mb-4">
                {serverError}
              </div>
            )}

            {forgotSuccess ? (
              <div className="bg-green-500/10 border border-green-500/30 text-green-400 text-sm rounded-lg p-4 text-center">
                <p className="font-semibold mb-1">Email sent!</p>
                <p>Check your inbox for a password reset link. It may take a minute to arrive.</p>
              </div>
            ) : (
              <form onSubmit={forgotForm.handleSubmit(handleForgot)} className="space-y-4">
                <div>
                  <Label required>Email Address</Label>
                  <Input
                    type="email"
                    {...forgotForm.register("email")}
                    placeholder="you@business.com.au"
                  />
                  {forgotForm.formState.errors.email && (
                    <p className="text-destructive text-sm mt-1">{forgotForm.formState.errors.email.message}</p>
                  )}
                </div>

                <Button type="submit" disabled={isPending} className="w-full h-12 text-base font-bold">
                  {isPending ? <Loader2 className="animate-spin w-5 h-5" /> : "Send Reset Link"}
                </Button>
              </form>
            )}
          </Card>
        )}
      </div>
    </div>
  );
}
