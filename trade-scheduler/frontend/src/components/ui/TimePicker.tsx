import { useRef, useEffect, useCallback, useState } from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Clock } from "lucide-react";

// ── Constants ─────────────────────────────────────────────────────────────────

const ITEM_H = 44; // px per row
const VISIBLE = 5; // rows shown (centre = selected)
const HOURS = [12, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]; // 12-hour clock order
const MINUTES = ["00", "15", "30", "45"];
const PERIODS = ["AM", "PM"] as const;

// ── Helpers ───────────────────────────────────────────────────────────────────

function to24h(h: number, m: string, period: "AM" | "PM"): string {
  let hour = h;
  if (period === "AM" && h === 12) hour = 0;
  if (period === "PM" && h !== 12) hour = h + 12;
  return `${String(hour).padStart(2, "0")}:${m}`;
}

function parseValue(value: string): { hour: number; minute: string; period: "AM" | "PM" } {
  if (!value) return { hour: 8, minute: "00", period: "AM" };
  const [hStr, mStr] = value.split(":");
  const h = parseInt(hStr, 10);
  const m = parseInt(mStr, 10);
  const period: "AM" | "PM" = h >= 12 ? "PM" : "AM";
  const hour = h % 12 === 0 ? 12 : h % 12;
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

// ── Drum column ────────────────────────────────────────────────────────────────

interface DrumProps<T extends string | number> {
  items: T[];
  value: T;
  onChange: (v: T) => void;
  label?: (v: T) => string;
  width?: string;
}

function DrumColumn<T extends string | number>({ items, value, onChange, label, width = "w-14" }: DrumProps<T>) {
  const containerRef = useRef<HTMLDivElement>(null);
  const isScrollingByCode = useRef(false);
  const scrollTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  const idx = items.indexOf(value);

  // Scroll to the correct item whenever value changes externally
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const target = idx * ITEM_H;
    if (Math.abs(el.scrollTop - target) < 2) return;
    isScrollingByCode.current = true;
    el.scrollTo({ top: target, behavior: "smooth" });
    setTimeout(() => { isScrollingByCode.current = false; }, 300);
  }, [idx]);

  const handleScroll = useCallback(() => {
    if (isScrollingByCode.current) return;
    const el = containerRef.current;
    if (!el) return;
    if (scrollTimeout.current) clearTimeout(scrollTimeout.current);
    scrollTimeout.current = setTimeout(() => {
      const newIdx = Math.round(el.scrollTop / ITEM_H);
      const clamped = Math.max(0, Math.min(items.length - 1, newIdx));
      // Snap to grid
      isScrollingByCode.current = true;
      el.scrollTo({ top: clamped * ITEM_H, behavior: "smooth" });
      setTimeout(() => { isScrollingByCode.current = false; }, 300);
      if (items[clamped] !== value) onChange(items[clamped]);
    }, 80);
  }, [items, value, onChange]);

  const clickItem = (item: T, i: number) => {
    onChange(item);
    const el = containerRef.current;
    if (!el) return;
    isScrollingByCode.current = true;
    el.scrollTo({ top: i * ITEM_H, behavior: "smooth" });
    setTimeout(() => { isScrollingByCode.current = false; }, 300);
  };

  return (
    <div className={`relative ${width} flex-shrink-0`}>
      {/* Selection band */}
      <div
        className="pointer-events-none absolute inset-x-0 z-10 rounded-lg bg-primary/15 border border-primary/30"
        style={{ top: ITEM_H * 2, height: ITEM_H }}
      />
      {/* Fade top */}
      <div className="pointer-events-none absolute top-0 inset-x-0 z-20 h-16 bg-gradient-to-b from-popover to-transparent" />
      {/* Fade bottom */}
      <div className="pointer-events-none absolute bottom-0 inset-x-0 z-20 h-16 bg-gradient-to-t from-popover to-transparent" />

      <div
        ref={containerRef}
        className="overflow-y-scroll"
        style={{
          height: ITEM_H * VISIBLE,
          scrollSnapType: "y mandatory",
          scrollbarWidth: "none",
          msOverflowStyle: "none",
        }}
        onScroll={handleScroll}
      >
        {/* Top padding to let first item sit in the centre */}
        <div style={{ height: ITEM_H * 2 }} />
        {items.map((item, i) => (
          <div
            key={i}
            onClick={() => clickItem(item, i)}
            className={`flex items-center justify-center cursor-pointer transition-all select-none`}
            style={{ height: ITEM_H, scrollSnapAlign: "center" }}
          >
            <span
              className={`text-sm font-bold transition-all duration-150 ${
                item === value
                  ? "text-primary text-base scale-110"
                  : "text-muted-foreground scale-90"
              }`}
            >
              {label ? label(item) : String(item)}
            </span>
          </div>
        ))}
        {/* Bottom padding */}
        <div style={{ height: ITEM_H * 2 }} />
      </div>
    </div>
  );
}

// ── TimePicker ─────────────────────────────────────────────────────────────────

interface TimePickerProps {
  value: string; // "HH:mm" 24-hour
  onChange: (value: string) => void;
}

export function TimePicker({ value, onChange }: TimePickerProps) {
  const [open, setOpen] = useState(false);
  const parsed = parseValue(value);
  const [hour, setHour] = useState(parsed.hour);
  const [minute, setMinute] = useState(parsed.minute);
  const [period, setPeriod] = useState<"AM" | "PM">(parsed.period);

  // Keep local state in sync when the popover opens with a new external value
  useEffect(() => {
    if (open) {
      const p = parseValue(value);
      setHour(p.hour);
      setMinute(p.minute);
      setPeriod(p.period);
    }
  }, [open, value]);

  const commit = (h: number, m: string, p: "AM" | "PM") => {
    onChange(to24h(h, m, p));
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

      <PopoverContent className="w-auto p-4" align="start">
        <p className="text-[10px] uppercase text-muted-foreground font-display tracking-widest mb-3">
          Select Time
        </p>

        <div className="flex items-center gap-1">
          {/* Hour drum */}
          <DrumColumn
            items={HOURS}
            value={hour}
            width="w-12"
            onChange={(h) => { setHour(h); commit(h, minute, period); }}
          />

          {/* Separator */}
          <span className="text-xl font-bold text-foreground pb-0.5 select-none">:</span>

          {/* Minute drum */}
          <DrumColumn
            items={MINUTES}
            value={minute}
            width="w-14"
            label={(m) => m}
            onChange={(m) => { setMinute(m); commit(hour, m, period); }}
          />

          {/* AM / PM drum */}
          <DrumColumn
            items={PERIODS}
            value={period}
            width="w-12"
            onChange={(p) => { setPeriod(p); commit(hour, minute, p); }}
          />
        </div>

        {/* Live preview */}
        <div className="mt-3 pt-3 border-t border-border text-center font-display text-lg font-bold text-primary">
          {hour}:{minute} {period}
        </div>
      </PopoverContent>
    </Popover>
  );
}
