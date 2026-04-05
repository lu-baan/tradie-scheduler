import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Loader2, Eye, EyeOff, UserPlus, ShieldCheck } from "lucide-react";
import { toast } from "sonner";

const registerSchema = z.object({
  fullName: z.string().min(2, "Full name is required"),
  loginNumber: z
    .string()
    .length(6, "Login number must be exactly 6 digits")
    .regex(/^\d{6}$/, "Must be 6 digits only"),
  password: z.string().min(8, "Password must be at least 8 characters"),
  confirmPassword: z.string(),
  email: z.string().email("Enter a valid email").or(z.literal("")),
  role: z.enum(["admin", "worker"]),
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
      loginNumber: "",
      password: "",
      confirmPassword: "",
      email: "",
      role: "worker",
    },
  });

  const selectedRole = form.watch("role");

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
                  onClick={() => form.setValue("role", role)}
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

          {/* Login number */}
          <div>
            <Label required>Login Number</Label>
            <Input
              {...form.register("loginNumber")}
              placeholder="6-digit number (e.g. 100002)"
              maxLength={6}
              inputMode="numeric"
              className="mt-1 font-mono tracking-widest"
            />
            {form.formState.errors.loginNumber ? (
              <p className="text-destructive text-xs mt-1">{form.formState.errors.loginNumber.message}</p>
            ) : (
              <p className="text-[11px] text-muted-foreground mt-1">
                Admin accounts start with <span className="font-mono text-primary">1</span>, workers with any other digit.
              </p>
            )}
          </div>

          {/* Email */}
          <div>
            <Label>Email Address</Label>
            <Input
              {...form.register("email")}
              type="email"
              placeholder="jane@business.com.au (optional)"
              className="mt-1"
            />
            {form.formState.errors.email && (
              <p className="text-destructive text-xs mt-1">{form.formState.errors.email.message}</p>
            )}
          </div>

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
