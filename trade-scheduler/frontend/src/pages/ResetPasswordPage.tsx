import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Loader2, Eye, EyeOff, CheckCircle2, Sun, Moon } from "lucide-react";
import { useLocation } from "wouter";

const schema = z
  .object({
    newPassword:     z.string().min(8, "Password must be at least 8 characters"),
    confirmPassword: z.string(),
  })
  .refine(d => d.newPassword === d.confirmPassword, {
    message: "Passwords do not match",
    path: ["confirmPassword"],
  });

type FormValues = z.infer<typeof schema>;

function Label({ children, required = false }: { children: React.ReactNode; required?: boolean }) {
  return (
    <label className="text-xs uppercase text-muted-foreground font-display mb-1 block">
      {children}
      {required && <span className="text-destructive ml-0.5">*</span>}
    </label>
  );
}

export function ResetPasswordPage({
  theme,
  onToggleTheme,
}: {
  theme: "dark" | "light";
  onToggleTheme: () => void;
}) {
  const [, navigate] = useLocation();
  const token = new URLSearchParams(window.location.search).get("token") ?? "";

  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [isPending, setIsPending] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { newPassword: "", confirmPassword: "" },
  });

  const handleSubmit = async (data: FormValues) => {
    setIsPending(true);
    setServerError(null);
    try {
      const res = await fetch("/api/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, newPassword: data.newPassword }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Reset failed" }));
        throw new Error(err.error || "Reset failed");
      }
      setSuccess(true);
    } catch (err: any) {
      setServerError(err.message || "Something went wrong. Please try again.");
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

        <Card className="p-8 bg-card border-white/5 shadow-2xl animate-in fade-in slide-in-from-bottom-4 duration-300">
          {!token ? (
            <div className="text-center space-y-4">
              <p className="text-destructive font-semibold">Invalid reset link.</p>
              <p className="text-muted-foreground text-sm">The link is missing a token. Please request a new password reset.</p>
              <Button variant="outline" className="w-full" onClick={() => navigate("/")}>
                Back to Login
              </Button>
            </div>
          ) : success ? (
            <div className="text-center space-y-4">
              <CheckCircle2 className="w-12 h-12 text-green-400 mx-auto" />
              <h2 className="font-display text-2xl font-bold text-foreground">Password Updated</h2>
              <p className="text-muted-foreground text-sm">Your password has been reset. You can now sign in with your new password.</p>
              <Button
                className="w-full h-12 font-bold shadow-[0_0_20px_rgba(234,88,12,0.4)]"
                onClick={() => navigate("/")}
              >
                Back to Login
              </Button>
            </div>
          ) : (
            <>
              <h2 className="font-display text-2xl font-bold text-foreground mb-1">Set New Password</h2>
              <p className="text-muted-foreground text-sm mb-6">Enter and confirm your new password below.</p>

              {serverError && (
                <div className="bg-destructive/10 border border-destructive/30 text-destructive text-sm rounded-lg p-3 mb-4">
                  {serverError}
                </div>
              )}

              <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-5">
                <div>
                  <Label required>New Password</Label>
                  <div className="relative mt-1">
                    <Input
                      type={showNew ? "text" : "password"}
                      {...form.register("newPassword")}
                      placeholder="At least 8 characters"
                      className="pr-10"
                    />
                    <button
                      type="button"
                      className="absolute right-3 top-3 text-muted-foreground hover:text-foreground transition-colors"
                      onClick={() => setShowNew(p => !p)}
                      tabIndex={-1}
                    >
                      {showNew ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                  </div>
                  {form.formState.errors.newPassword && (
                    <p className="text-destructive text-xs mt-1">{form.formState.errors.newPassword.message}</p>
                  )}
                </div>

                <div>
                  <Label required>Confirm Password</Label>
                  <div className="relative mt-1">
                    <Input
                      type={showConfirm ? "text" : "password"}
                      {...form.register("confirmPassword")}
                      placeholder="Re-enter new password"
                      className="pr-10"
                    />
                    <button
                      type="button"
                      className="absolute right-3 top-3 text-muted-foreground hover:text-foreground transition-colors"
                      onClick={() => setShowConfirm(p => !p)}
                      tabIndex={-1}
                    >
                      {showConfirm ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                  </div>
                  {form.formState.errors.confirmPassword && (
                    <p className="text-destructive text-xs mt-1">{form.formState.errors.confirmPassword.message}</p>
                  )}
                </div>

                <Button
                  type="submit"
                  disabled={isPending}
                  className="w-full h-12 text-base font-bold shadow-[0_0_20px_rgba(234,88,12,0.4)]"
                >
                  {isPending ? <Loader2 className="animate-spin w-5 h-5" /> : "Set New Password"}
                </Button>
              </form>
            </>
          )}
        </Card>
      </div>
    </div>
  );
}
