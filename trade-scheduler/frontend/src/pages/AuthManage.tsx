import { useState, useCallback } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Loader2, Eye, EyeOff, UserPlus, ShieldCheck, RefreshCw } from "lucide-react";
import { toast } from "sonner";

function generateLoginNumber(role: "admin" | "worker"): string {
  const prefix = role === "admin" ? "1" : "2";
  const rest = Math.floor(10000 + Math.random() * 89999).toString();
  return prefix + rest;
}

const registerSchema = z.object({
  fullName: z.string().min(2, "Full name is required"),
  loginNumber: z
    .string()
    .length(6, "Login number must be exactly 6 digits")
    .regex(/^\d{6}$/, "Must be 6 digits only"),
  password: z.string().min(8, "Password must be at least 8 characters"),
  confirmPassword: z.string(),
  email: z.string().email("Enter a valid email address"),
  role: z.enum(["admin", "worker"]),
  tradeType: z.string().min(2, "Trade specialization is required").optional().or(z.literal("")),
  phone: z.string().optional().or(z.literal("")),
}).refine(d => d.password === d.confirmPassword, {
  message: "Passwords do not match",
  path: ["confirmPassword"],
});

type RegisterForm = z.infer<typeof registerSchema>;

function Label({ children, required = false }: { children: React.ReactNode; required?: boolean }) {
  return (
    <label className="text-xs uppercase text-muted-foreground font-display mb-1 block">
      {children}
      {required && <span className="text-destructive ml-0.5">*</span>}
    </label>
  );
}

export function AuthManage() {
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [isPending, setIsPending] = useState(false);

  const form = useForm<RegisterForm>({
    resolver: zodResolver(registerSchema),
    defaultValues: {
      fullName: "",
      loginNumber: generateLoginNumber("worker"),
      password: "",
      confirmPassword: "",
      email: "",
      role: "worker",
      tradeType: "",
      phone: "",
    },
  });

  const selectedRole = form.watch("role");

  const regenerateLoginNumber = useCallback(() => {
    form.setValue("loginNumber", generateLoginNumber(selectedRole));
  }, [form, selectedRole]);

  const handleRegister = async (data: RegisterForm) => {
    setIsPending(true);
    try {
      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fullName: data.fullName,
          loginNumber: data.loginNumber,
          password: data.password,
          email: data.email || null,
          role: data.role,
          tradeType: data.tradeType || null,
          phone: data.phone || null,
        }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Registration failed" }));
        throw new Error(err.error || "Registration failed");
      }

      toast.success("Account created!", {
        description: `${data.fullName} can now log in with number ${data.loginNumber}.`,
      });
      form.reset();
    } catch (err: any) {
      toast.error("Failed to create account", { description: err.message });
    } finally {
      setIsPending(false);
    }
  };

  return (
    <div className="max-w-lg animate-in fade-in duration-500">
      <div className="mb-6">
        <h1 className="text-3xl sm:text-4xl font-display font-bold text-foreground flex items-center gap-3">
          <ShieldCheck className="text-primary" size={32} />
          Auth
        </h1>
        <p className="text-muted-foreground mt-1">Register new accounts for workers and admins.</p>
      </div>

      <Card className="p-6 bg-card border-white/5 shadow-2xl">
        <div className="flex items-center gap-2 mb-5">
          <UserPlus size={18} className="text-primary" />
          <h2 className="font-display text-lg font-bold text-foreground uppercase tracking-wide">
            Register Account
          </h2>
        </div>

        <form onSubmit={form.handleSubmit(handleRegister)} className="space-y-5">
          {/* Role selector */}
          <div>
            <Label required>Account Type</Label>
            <div className="flex gap-3 mt-1">
              {(["worker", "admin"] as const).map(role => (
                <button
                  type="button"
                  key={role}
                  onClick={() => {
                    form.setValue("role", role);
                    form.setValue("loginNumber", generateLoginNumber(role));
                  }}
                  className={`flex-1 py-2.5 rounded-lg border text-sm font-display uppercase tracking-wide transition-all ${
                    selectedRole === role
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-border text-muted-foreground hover:border-primary/40 hover:text-foreground"
                  }`}
                >
                  {role === "admin" ? "Admin / Foreman" : "Worker"}
                </button>
              ))}
            </div>
            {selectedRole === "admin" && (
              <p className="text-[11px] text-orange-400 mt-1.5 flex items-center gap-1">
                <ShieldCheck size={11} /> Admin accounts have full access to all data and settings.
              </p>
            )}
          </div>

          {/* Full name */}
          <div>
            <Label required>Full Name</Label>
            <Input
              {...form.register("fullName")}
              placeholder="Jane Smith"
              className="mt-1"
            />
            {form.formState.errors.fullName && (
              <p className="text-destructive text-xs mt-1">{form.formState.errors.fullName.message}</p>
            )}
          </div>

          {/* Login number — auto-generated, read-only */}
          <div>
            <Label required>Login Number</Label>
            <div className="flex gap-2 mt-1">
              <div className="flex-1 h-10 flex items-center px-3 rounded-md border border-input bg-secondary/40 font-mono tracking-widest text-lg font-bold text-primary">
                {form.watch("loginNumber")}
              </div>
              <button
                type="button"
                onClick={regenerateLoginNumber}
                className="px-3 h-10 rounded-md border border-input bg-secondary/40 text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
                title="Regenerate login number"
              >
                <RefreshCw size={15} />
              </button>
            </div>
            <p className="text-[11px] text-muted-foreground mt-1">
              Auto-generated. Admins start with <span className="font-mono text-primary">1</span>, workers with <span className="font-mono text-primary">2</span>. Share this with the user after creation.
            </p>
          </div>

          {/* Email — required for account recovery */}
          <div>
            <Label required>Email Address</Label>
            <Input
              {...form.register("email")}
              type="email"
              placeholder="jane@business.com.au"
              className="mt-1"
            />
            <p className="text-[11px] text-muted-foreground mt-1">Required for password recovery.</p>
            {form.formState.errors.email && (
              <p className="text-destructive text-xs mt-1">{form.formState.errors.email.message}</p>
            )}
          </div>

          {/* Worker-only fields */}
          {selectedRole === "worker" && (
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label required>Trade Specialization</Label>
                <select
                  {...form.register("tradeType")}
                  className="mt-1 flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:ring-2 focus:ring-primary"
                >
                  <option value="">Select trade type</option>
                  {((() => {
                    try { return JSON.parse(localStorage.getItem("tradeTypes") || "[]"); } catch { return []; }
                  })() as string[]).map((t: string) => (
                    <option key={t} value={t}>{t}</option>
                  ))}
                </select>
                {form.formState.errors.tradeType && (
                  <p className="text-destructive text-xs mt-1">{form.formState.errors.tradeType.message}</p>
                )}
              </div>
              <div>
                <Label>Phone</Label>
                <Input
                  {...form.register("phone")}
                  placeholder="0412 345 678"
                  inputMode="tel"
                  className="mt-1"
                />
              </div>
            </div>
          )}

          {/* Password */}
          <div>
            <Label required>Password</Label>
            <div className="relative mt-1">
              <Input
                type={showPassword ? "text" : "password"}
                {...form.register("password")}
                placeholder="At least 8 characters"
                className="pr-10"
              />
              <button
                type="button"
                className="absolute right-3 top-3 text-muted-foreground hover:text-foreground transition-colors"
                onClick={() => setShowPassword(p => !p)}
                tabIndex={-1}
              >
                {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
            {form.formState.errors.password && (
              <p className="text-destructive text-xs mt-1">{form.formState.errors.password.message}</p>
            )}
          </div>

          {/* Confirm Password */}
          <div>
            <Label required>Confirm Password</Label>
            <div className="relative mt-1">
              <Input
                type={showConfirm ? "text" : "password"}
                {...form.register("confirmPassword")}
                placeholder="Re-enter password"
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

          {/* Summary */}
          {form.watch("fullName") && form.watch("loginNumber").length === 6 && (
            <div className="bg-secondary/40 border border-border rounded-lg p-3 text-xs space-y-1">
              <p className="text-muted-foreground font-semibold uppercase tracking-wide mb-2">Account Summary</p>
              <div className="flex items-center gap-2">
                <span className="text-muted-foreground w-20">Name:</span>
                <span className="text-foreground font-semibold">{form.watch("fullName")}</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-muted-foreground w-20">Login #:</span>
                <span className="font-mono text-primary font-bold">{form.watch("loginNumber")}</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-muted-foreground w-20">Role:</span>
                <Badge variant={selectedRole === "admin" ? "default" : "secondary"} className="text-[10px]">
                  {selectedRole === "admin" ? "Admin / Foreman" : "Worker"}
                </Badge>
              </div>
            </div>
          )}

          <Button
            type="submit"
            disabled={isPending}
            className="w-full h-11 text-base font-bold shadow-[0_0_20px_rgba(234,88,12,0.3)]"
          >
            {isPending ? (
              <><Loader2 className="animate-spin w-4 h-4 mr-2" /> Creating Account...</>
            ) : (
              <><UserPlus size={16} className="mr-2" /> Create Account</>
            )}
          </Button>
        </form>
      </Card>
    </div>
  );
}
