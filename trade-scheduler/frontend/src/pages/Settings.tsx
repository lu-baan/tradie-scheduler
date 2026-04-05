import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Save, Building2, Clock, Bell, MapPin, DollarSign, Shield, Wrench, Plus, X } from "lucide-react";
import * as Switch from "@radix-ui/react-switch";
import { toast } from "sonner";

interface AppSettings {
  businessName: string;
  abn: string;
  contactEmail: string;
  contactPhone: string;
  businessAddress: string;
  gstRate: number;
  currency: string;
  distanceUnits: string;
  workStartHour: string;
  workEndHour: string;
  workDays: string[];
  smsNotifications: boolean;
  emailNotifications: boolean;
  emergencyAlerts: boolean;
  autoAssignWorkers: boolean;
  defaultEstimatedHours: number;
  maxJobTitleLength: number;
  maxNotesLength: number;
}

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

const DEFAULT_TRADE_TYPES = [
  "Carpenter", "Electrician", "General Builder", "HVAC",
  "Landscaper", "Painter", "Plumber", "Roofer",
];

function loadTradeTypes(): string[] {
  try {
    const stored = localStorage.getItem("tradeTypes");
    return stored ? JSON.parse(stored) : DEFAULT_TRADE_TYPES;
  } catch {
    return DEFAULT_TRADE_TYPES;
  }
}

function saveTradeTypes(types: string[]) {
  localStorage.setItem("tradeTypes", JSON.stringify(types));
}

function Label({ children }: { children: React.ReactNode }) {
  return (
    <label className="text-xs uppercase text-muted-foreground font-display mb-1 block">
      {children}
    </label>
  );
}

function SectionCard({
  icon: Icon,
  title,
  children,
}: {
  icon: React.ComponentType<{ size?: number; className?: string }>;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <Card className="p-6 bg-card border-white/5 shadow-2xl">
      <div className="flex items-center gap-2 mb-5">
        <Icon size={20} className="text-primary" />
        <h3 className="font-display text-lg text-primary uppercase">{title}</h3>
      </div>
      <div className="space-y-4">{children}</div>
    </Card>
  );
}

function SettingRow({
  label,
  description,
  children,
}: {
  label: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex justify-between items-center p-4 border border-border rounded-lg bg-background/50 gap-4">
      <div className="flex-1 min-w-0">
        <div className="font-bold text-sm">{label}</div>
        {description && <div className="text-xs text-muted-foreground mt-0.5">{description}</div>}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}

function ToggleSwitch({ checked, onChange }: { checked: boolean; onChange: (checked: boolean) => void }) {
  return (
    <Switch.Root
      className={`w-10 h-5 rounded-full relative transition-colors ${checked ? "bg-primary" : "bg-muted"}`}
      checked={checked}
      onCheckedChange={onChange}
    >
      <Switch.Thumb
        className={`block w-4 h-4 bg-white rounded-full shadow transition-transform translate-x-0.5 ${checked ? "translate-x-[22px]" : ""}`}
      />
    </Switch.Root>
  );
}

export function Settings() {
  const [settings, setSettings] = useState<AppSettings>({
    businessName: "",
    abn: "",
    contactEmail: "",
    contactPhone: "",
    businessAddress: "",
    gstRate: 10,
    currency: "AUD",
    distanceUnits: "km",
    workStartHour: "07:00",
    workEndHour: "17:00",
    workDays: ["Mon", "Tue", "Wed", "Thu", "Fri"],
    smsNotifications: true,
    emailNotifications: true,
    emergencyAlerts: true,
    autoAssignWorkers: false,
    defaultEstimatedHours: 1,
    maxJobTitleLength: 80,
    maxNotesLength: 500,
  });

  const [hasChanges, setHasChanges] = useState(false);
  const [tradeTypes, setTradeTypes] = useState<string[]>(loadTradeTypes);
  const [newTradeType, setNewTradeType] = useState("");

  const update = (key: keyof AppSettings, value: any) => {
    setSettings(prev => ({ ...prev, [key]: value }));
    setHasChanges(true);
  };

  const handleSave = () => {
    // TODO: POST to /api/settings
    toast.success("Settings saved!", { description: "Your preferences have been updated." });
    setHasChanges(false);
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-500 max-w-3xl">
      <div className="flex justify-between items-end">
        <div>
          <h1 className="text-4xl font-display font-bold text-foreground">Settings</h1>
          <p className="text-muted-foreground mt-1">Configure your app preferences.</p>
        </div>
        {hasChanges && (
          <Button onClick={handleSave} className="shadow-[0_0_20px_rgba(234,88,12,0.4)]">
            <Save size={16} className="mr-2" /> Save Changes
          </Button>
        )}
      </div>

      {/* Business Details */}
      <SectionCard icon={Building2} title="Business Details">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <Label>Business Name</Label>
            <Input
              value={settings.businessName}
              onChange={e => update("businessName", e.target.value)}
              placeholder="e.g. Smith's Electrical Pty Ltd"
            />
          </div>
          <div>
            <Label>ABN</Label>
            <Input
              value={settings.abn}
              onChange={e => update("abn", e.target.value)}
              placeholder="e.g. 12 345 678 901"
            />
          </div>
          <div>
            <Label>Contact Email</Label>
            <Input
              type="email"
              value={settings.contactEmail}
              onChange={e => update("contactEmail", e.target.value)}
              placeholder="admin@business.com.au"
            />
          </div>
          <div>
            <Label>Contact Phone</Label>
            <Input
              value={settings.contactPhone}
              onChange={e => update("contactPhone", e.target.value)}
              placeholder="0412 345 678"
            />
          </div>
        </div>
        <div>
          <Label>Business Address</Label>
          <Input
            value={settings.businessAddress}
            onChange={e => update("businessAddress", e.target.value)}
            placeholder="123 Main St, Melbourne VIC 3000"
          />
        </div>
      </SectionCard>

      {/* Financial */}
      <SectionCard icon={DollarSign} title="Financial">
        <SettingRow label="Australian GST Rate" description="Applied to invoice generation">
          <span className="font-mono text-lg">{settings.gstRate}%</span>
        </SettingRow>
        <SettingRow label="Default Currency">
          <select
            value={settings.currency}
            onChange={e => update("currency", e.target.value)}
            className="bg-background border border-input rounded-md px-3 py-1.5 text-sm"
          >
            <option value="AUD">AUD ($)</option>
            <option value="NZD">NZD ($)</option>
          </select>
        </SettingRow>
        <SettingRow label="Distance Units">
          <select
            value={settings.distanceUnits}
            onChange={e => update("distanceUnits", e.target.value)}
            className="bg-background border border-input rounded-md px-3 py-1.5 text-sm"
          >
            <option value="km">Kilometers (km)</option>
            <option value="mi">Miles (mi)</option>
          </select>
        </SettingRow>
      </SectionCard>

      {/* Working Hours */}
      <SectionCard icon={Clock} title="Working Hours">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <Label>Start Time</Label>
            <Input type="time" value={settings.workStartHour} onChange={e => update("workStartHour", e.target.value)} />
          </div>
          <div>
            <Label>End Time</Label>
            <Input type="time" value={settings.workEndHour} onChange={e => update("workEndHour", e.target.value)} />
          </div>
        </div>
        <div>
          <Label>Working Days</Label>
          <div className="flex flex-wrap gap-2 mt-1">
            {WEEKDAYS.map(day => {
              const active = settings.workDays.includes(day);
              return (
                <button
                  key={day}
                  type="button"
                  className={`px-3 py-1.5 rounded-md text-xs font-display uppercase border transition-colors ${
                    active
                      ? "bg-primary text-primary-foreground border-primary"
                      : "bg-background border-input text-muted-foreground hover:border-primary/50"
                  }`}
                  onClick={() =>
                    update("workDays", active
                      ? settings.workDays.filter(d => d !== day)
                      : [...settings.workDays, day]
                    )
                  }
                >
                  {day}
                </button>
              );
            })}
          </div>
        </div>
      </SectionCard>

      {/* Job Defaults */}
      <SectionCard icon={MapPin} title="Job Defaults">
        <SettingRow label="Default Estimated Hours" description="Initial value for new bookings">
          <Input
            type="number"
            min="0.5"
            max="24"
            step="0.5"
            value={settings.defaultEstimatedHours}
            onChange={e => update("defaultEstimatedHours", Number(e.target.value))}
            className="w-20 text-center"
          />
        </SettingRow>
        <SettingRow
          label="Auto-assign Workers"
          description="Automatically suggest workers based on trade type and availability"
        >
          <ToggleSwitch checked={settings.autoAssignWorkers} onChange={c => update("autoAssignWorkers", c)} />
        </SettingRow>
      </SectionCard>

      {/* Trade Types */}
      <SectionCard icon={Wrench} title="Trade Types">
        <p className="text-xs text-muted-foreground -mt-2">
          These appear in job forms, worker profiles, and filters throughout the app.
        </p>
        <div className="flex gap-2">
          <Input
            placeholder="e.g. Concreter"
            value={newTradeType}
            onChange={e => setNewTradeType(e.target.value)}
            onKeyDown={e => {
              if (e.key === "Enter") {
                e.preventDefault();
                const trimmed = newTradeType.trim();
                if (!trimmed || tradeTypes.includes(trimmed)) return;
                const updated = [...tradeTypes, trimmed].sort();
                setTradeTypes(updated);
                saveTradeTypes(updated);
                setNewTradeType("");
                toast.success(`"${trimmed}" added`);
              }
            }}
          />
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              const trimmed = newTradeType.trim();
              if (!trimmed || tradeTypes.includes(trimmed)) return;
              const updated = [...tradeTypes, trimmed].sort();
              setTradeTypes(updated);
              saveTradeTypes(updated);
              setNewTradeType("");
              toast.success(`"${trimmed}" added`);
            }}
          >
            <Plus size={15} />
          </Button>
        </div>
        <div className="flex flex-wrap gap-2 mt-1">
          {tradeTypes.map(t => (
            <div
              key={t}
              className="flex items-center gap-1.5 bg-secondary border border-border rounded-full px-3 py-1 text-sm"
            >
              <span>{t}</span>
              <button
                type="button"
                onClick={() => {
                  const updated = tradeTypes.filter(x => x !== t);
                  setTradeTypes(updated);
                  saveTradeTypes(updated);
                  toast.success(`"${t}" removed`);
                }}
                className="text-muted-foreground hover:text-destructive transition-colors"
              >
                <X size={12} />
              </button>
            </div>
          ))}
        </div>
      </SectionCard>

      {/* Notifications */}
      <SectionCard icon={Bell} title="Notifications">
        <SettingRow label="SMS Notifications" description="Send SMS to clients on job completion">
          <ToggleSwitch checked={settings.smsNotifications} onChange={c => update("smsNotifications", c)} />
        </SettingRow>
        <SettingRow label="Email Notifications" description="Send email summaries and invoice copies">
          <ToggleSwitch checked={settings.emailNotifications} onChange={c => update("emailNotifications", c)} />
        </SettingRow>
        <SettingRow label="Emergency Alerts" description="Notify all assigned tradies when Code 9 is triggered">
          <ToggleSwitch checked={settings.emergencyAlerts} onChange={c => update("emergencyAlerts", c)} />
        </SettingRow>
      </SectionCard>

      {/* Validation Limits */}
      <SectionCard icon={Shield} title="Validation Limits">
        <SettingRow label="Max Job Title Length" description="Character limit for job titles">
          <Input
            type="number"
            min="20"
            max="200"
            value={settings.maxJobTitleLength}
            onChange={e => update("maxJobTitleLength", Number(e.target.value))}
            className="w-20 text-center"
          />
        </SettingRow>
        <SettingRow label="Max Notes Length" description="Character limit for job notes">
          <Input
            type="number"
            min="100"
            max="2000"
            value={settings.maxNotesLength}
            onChange={e => update("maxNotesLength", Number(e.target.value))}
            className="w-20 text-center"
          />
        </SettingRow>
      </SectionCard>

      {/* Sticky save button */}
      {hasChanges && (
        <div className="sticky bottom-4 flex justify-end">
          <Button onClick={handleSave} size="lg" className="shadow-[0_0_20px_rgba(234,88,12,0.4)] font-bold">
            <Save size={18} className="mr-2" /> Save All Changes
          </Button>
        </div>
      )}
    </div>
  );
}
