import { useState } from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Clock } from "lucide-react";

interface TimePickerProps {
  value: string; // "HH:mm" 24h
  onChange: (value: string) => void;
}

const HOURS = [6, 7, 8, 9, 10, 11, 12, 1, 2, 3, 4, 5];
const MINUTES = ["00", "15", "30", "45"];

function to24h(h: number, m: string, period: "AM" | "PM"): string {
  let hour = h;
  if (period === "AM" && h === 12) hour = 0;
  if (period === "PM" && h !== 12) hour = h + 12;
  return `${String(hour).padStart(2, "0")}:${m}`;
}

function parseValue(value: string): { hour: number; minute: string; period: "AM" | "PM" } {
  if (!value) return { hour: 8, minute: "00", period: "AM" };
  const [h, m] = value.split(":").map(Number);
  const period: "AM" | "PM" = h >= 12 ? "PM" : "AM";
  const hour = h % 12 === 0 ? 12 : h % 12;
  const minute = String(m).padStart(2, "0");
  // Snap minute to nearest 15
  const snapped = MINUTES.reduce((prev, cur) =>
    Math.abs(parseInt(cur) - m) < Math.abs(parseInt(prev) - m) ? cur : prev
  );
  return { hour, minute: snapped, period };
}

function formatDisplay(value: string): string {
  if (!value) return "Pick a time…";
  const { hour, minute, period } = parseValue(value);
  return `${hour}:${minute} ${period}`;
}

export function TimePicker({ value, onChange }: TimePickerProps) {
  const [open, setOpen] = useState(false);
  const parsed = parseValue(value);
  const [hour, setHour] = useState(parsed.hour);
  const [minute, setMinute] = useState(parsed.minute);
  const [period, setPeriod] = useState<"AM" | "PM">(parsed.period);

  const commit = (h: number, m: string, p: "AM" | "PM") => {
    onChange(to24h(h, m, p));
  };

  const handleHour = (h: number) => {
    setHour(h);
    commit(h, minute, period);
  };

  const handleMinute = (m: string) => {
    setMinute(m);
    commit(hour, m, period);
  };

  const handlePeriod = (p: "AM" | "PM") => {
    setPeriod(p);
    commit(hour, minute, p);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          className="w-full h-12 justify-start text-left font-normal"
        >
          <Clock size={15} className="mr-2 text-muted-foreground shrink-0" />
          <span className={value ? "text-foreground" : "text-muted-foreground"}>
            {formatDisplay(value)}
          </span>
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-72 p-4" align="start">
        <p className="text-xs uppercase text-muted-foreground font-display mb-3 tracking-wider">Select Time</p>

        {/* AM / PM toggle */}
        <div className="flex gap-2 mb-4">
          {(["AM", "PM"] as const).map(p => (
            <button
              key={p}
              type="button"
              onClick={() => handlePeriod(p)}
              className={`flex-1 py-2 rounded-lg border text-sm font-display font-bold uppercase tracking-wide transition-all ${
                period === p
                  ? "bg-primary text-primary-foreground border-primary"
                  : "border-border text-muted-foreground hover:border-primary/40 hover:text-foreground"
              }`}
            >
              {p}
            </button>
          ))}
        </div>

        {/* Hour grid */}
        <p className="text-[10px] uppercase text-muted-foreground mb-2 tracking-widest">Hour</p>
        <div className="grid grid-cols-6 gap-1.5 mb-4">
          {HOURS.map(h => (
            <button
              key={h}
              type="button"
              onClick={() => handleHour(h)}
              className={`py-2 rounded-lg text-sm font-bold transition-all ${
                hour === h
                  ? "bg-primary text-primary-foreground"
                  : "bg-secondary text-foreground hover:bg-primary/20"
              }`}
            >
              {h}
            </button>
          ))}
        </div>

        {/* Minute grid */}
        <p className="text-[10px] uppercase text-muted-foreground mb-2 tracking-widest">Minute</p>
        <div className="grid grid-cols-4 gap-1.5">
          {MINUTES.map(m => (
            <button
              key={m}
              type="button"
              onClick={() => handleMinute(m)}
              className={`py-2 rounded-lg text-sm font-bold transition-all ${
                minute === m
                  ? "bg-primary text-primary-foreground"
                  : "bg-secondary text-foreground hover:bg-primary/20"
              }`}
            >
              :{m}
            </button>
          ))}
        </div>

        <div className="mt-4 pt-3 border-t border-border text-center font-display text-lg font-bold text-primary">
          {hour}:{minute} {period}
        </div>
      </PopoverContent>
    </Popover>
  );
}
