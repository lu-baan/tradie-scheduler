import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Loader2, Eye, EyeOff, ArrowLeft } from "lucide-react";

// ── Schemas ──────────────────────────────────────────────────────────────────

const loginSchema = z.object({
  email: z.string().email("Enter a valid email address"),
  password: z.string().min(6, "Password must be at least 6 characters"),
});

const signUpSchema = z.object({
  businessName: z.string().min(2, "Business name is required").max(100, "Business name too long"),
  fullName: z.string().min(2, "Full name is required").max(80, "Name too long"),
  email: z.string().email("Enter a valid email address"),
  phone: z
    .string()
    .regex(/^(\+?61|0)[2-478]\d{8}$/, "Enter a valid Australian phone number (e.g. 0412345678)")
    .optional()
    .or(z.literal("")),
  password: z.string().min(8, "Password must be at least 8 characters"),
  confirmPassword: z.string(),
}).refine(d => d.password === d.confirmPassword, {
  message: "Passwords do not match",
  path: ["confirmPassword"],
});

const forgotSchema = z.object({
  email: z.string().email("Enter a valid email address"),
});

// ── Types ─────────────────────────────────────────────────────────────────────

type AuthView = "login" | "signup" | "forgot";

// ── Required-field label helper ───────────────────────────────────────────────

function Label({ children, required = false }: { children: React.ReactNode; required?: boolean }) {
  return (
    <label className="text-xs uppercase text-muted-foreground font-display mb-1 block">
      {children}
      {required && <span className="text-destructive ml-0.5">*</span>}
    </label>
  );
}

// ── Component ─────────────────────────────────────────────────────────────────

export function AuthPage({ onLogin }: { onLogin: () => void }) {
  const [view, setView] = useState<AuthView>("login");
  const [showPassword, setShowPassword] = useState(false);
  const [isPending, setIsPending] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const [forgotSuccess, setForgotSuccess] = useState(false);

  const loginForm = useForm<z.infer<typeof loginSchema>>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: "", password: "" },
  });

  const signUpForm = useForm<z.infer<typeof signUpSchema>>({
    resolver: zodResolver(signUpSchema),
    defaultValues: {
      businessName: "", fullName: "", email: "", phone: "", password: "", confirmPassword: "",
    },
  });

  const forgotForm = useForm<z.infer<typeof forgotSchema>>({
    resolver: zodResolver(forgotSchema),
    defaultValues: { email: "" },
  });

  const handleLogin = async (data: z.infer<typeof loginSchema>) => {
    setIsPending(true);
    setServerError(null);
    try {
      // TODO: Replace with actual auth API call
      await new Promise(r => setTimeout(r, 600));
      onLogin();
    } catch (err: any) {
      setServerError(err.message || "Login failed. Please check your credentials.");
    } finally {
      setIsPending(false);
    }
  };

  const handleSignUp = async (data: z.infer<typeof signUpSchema>) => {
    setIsPending(true);
    setServerError(null);
    try {
      // TODO: Replace with actual auth API call
      await new Promise(r => setTimeout(r, 800));
      setView("login");
    } catch (err: any) {
      setServerError(err.message || "Sign-up failed. Please try again.");
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

  const PasswordToggle = (
    <button
      type="button"
      className="absolute right-3 top-3 text-muted-foreground hover:text-foreground transition-colors"
      onClick={() => setShowPassword(p => !p)}
      tabIndex={-1}
    >
      {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
    </button>
  );

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
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
            <p className="text-muted-foreground text-sm mb-6">Sign in to manage your jobs and tradies.</p>

            {serverError && (
              <div className="bg-destructive/10 border border-destructive/30 text-destructive text-sm rounded-lg p-3 mb-4">
                {serverError}
              </div>
            )}

            <form onSubmit={loginForm.handleSubmit(handleLogin)} className="space-y-4">
              <div>
                <Label required>Email</Label>
                <Input type="email" {...loginForm.register("email")} placeholder="you@business.com.au" />
                {loginForm.formState.errors.email && (
                  <p className="text-destructive text-sm mt-1">{loginForm.formState.errors.email.message}</p>
                )}
              </div>
              <div>
                <Label required>Password</Label>
                <div className="relative">
                  <Input
                    type={showPassword ? "text" : "password"}
                    {...loginForm.register("password")}
                    className="pr-10"
                  />
                  {PasswordToggle}
                </div>
                {loginForm.formState.errors.password && (
                  <p className="text-destructive text-sm mt-1">{loginForm.formState.errors.password.message}</p>
                )}
              </div>

              <div className="flex justify-end">
                <button
                  type="button"
                  className="text-sm text-primary hover:underline"
                  onClick={() => { setView("forgot"); setServerError(null); }}
                >
                  Forgot password?
                </button>
              </div>

              <Button type="submit" disabled={isPending} className="w-full h-12 text-base font-bold shadow-[0_0_20px_rgba(234,88,12,0.4)]">
                {isPending ? <Loader2 className="animate-spin w-5 h-5" /> : "Sign In"}
              </Button>
            </form>

            <p className="text-center text-sm text-muted-foreground mt-6">
              Don't have an account?{" "}
              <button className="text-primary font-semibold hover:underline" onClick={() => { setView("signup"); setServerError(null); }}>
                Create one
              </button>
            </p>
          </Card>
        )}

        {/* SIGN UP VIEW */}
        {view === "signup" && (
          <Card className="p-8 bg-card border-white/5 shadow-2xl animate-in fade-in slide-in-from-bottom-4 duration-300">
            <button
              className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground mb-4"
              onClick={() => { setView("login"); setServerError(null); }}
            >
              <ArrowLeft size={14} /> Back to login
            </button>

            <h2 className="font-display text-2xl font-bold text-foreground mb-1">Create Account</h2>
            <p className="text-muted-foreground text-sm mb-6">Set up your Trade Scheduler workspace.</p>

            {serverError && (
              <div className="bg-destructive/10 border border-destructive/30 text-destructive text-sm rounded-lg p-3 mb-4">
                {serverError}
              </div>
            )}

            <form onSubmit={signUpForm.handleSubmit(handleSignUp)} className="space-y-4">
              <div>
                <Label required>Business Name</Label>
                <Input {...signUpForm.register("businessName")} placeholder="e.g. Smith's Electrical Pty Ltd" />
                {signUpForm.formState.errors.businessName && (
                  <p className="text-destructive text-sm mt-1">{signUpForm.formState.errors.businessName.message}</p>
                )}
              </div>
              <div>
                <Label required>Your Full Name</Label>
                <Input {...signUpForm.register("fullName")} placeholder="e.g. John Smith" />
                {signUpForm.formState.errors.fullName && (
                  <p className="text-destructive text-sm mt-1">{signUpForm.formState.errors.fullName.message}</p>
                )}
              </div>
              <div>
                <Label required>Email</Label>
                <Input type="email" {...signUpForm.register("email")} placeholder="you@business.com.au" />
                {signUpForm.formState.errors.email && (
                  <p className="text-destructive text-sm mt-1">{signUpForm.formState.errors.email.message}</p>
                )}
              </div>
              <div>
                <Label>Phone (optional)</Label>
                <Input {...signUpForm.register("phone")} placeholder="0412 345 678" />
                {signUpForm.formState.errors.phone && (
                  <p className="text-destructive text-sm mt-1">{signUpForm.formState.errors.phone.message}</p>
                )}
              </div>
              <div>
                <Label required>Password</Label>
                <div className="relative">
                  <Input type={showPassword ? "text" : "password"} {...signUpForm.register("password")} className="pr-10" />
                  {PasswordToggle}
                </div>
                {signUpForm.formState.errors.password && (
                  <p className="text-destructive text-sm mt-1">{signUpForm.formState.errors.password.message}</p>
                )}
              </div>
              <div>
                <Label required>Confirm Password</Label>
                <Input type={showPassword ? "text" : "password"} {...signUpForm.register("confirmPassword")} />
                {signUpForm.formState.errors.confirmPassword && (
                  <p className="text-destructive text-sm mt-1">{signUpForm.formState.errors.confirmPassword.message}</p>
                )}
              </div>

              <Button type="submit" disabled={isPending} className="w-full h-12 text-base font-bold shadow-[0_0_20px_rgba(234,88,12,0.4)]">
                {isPending ? <Loader2 className="animate-spin w-5 h-5" /> : "Create Account"}
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
                  <Input type="email" {...forgotForm.register("email")} placeholder="you@business.com.au" />
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
