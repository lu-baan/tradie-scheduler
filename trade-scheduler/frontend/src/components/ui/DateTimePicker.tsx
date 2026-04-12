import { useRef, useEffect, useCallback, useState } from "react";
import { format, parseISO, isToday, isTomorrow } from "date-fns";
import { CalendarClock } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { DayPicker } from "react-day-picker";

// ── Drum helpers ───────────────────────────────────────────────────────────────

const ITEM_H = 44;
const VISIBLE = 5;
const HOURS = [12, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11];
const MINUTES = ["00", "15", "30", "45"];
const PERIODS: ("AM" | "PM")[] = ["AM", "PM"];

function to24h(h: number, m: string, p: "AM" | "PM"): string {
  let hour = h;
  if (p === "AM" && h === 12) hour = 0;
  if (p === "PM" && h !== 12) hour = h + 12;
  return `${String(hour).padStart(2, "0")}:${m}`;
}

function parseTime(value: string): { hour: number; minute: string; period: "AM" | "PM" } {
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

// ── Drum column ────────────────────────────────────────────────────────────────

interface DrumProps<T extends string | number> {
  items: T[];
  value: T;
  onChange: (v: T) => void;
  label?: (v: T) => string;
  width?: string;
}

function DrumColumn<T extends string | number>({
  items, value, onChange, label, width = "w-14",
}: DrumProps<T>) {
  const containerRef = useRef<HTMLDivElement>(null);
  const byCode = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const idx = items.indexOf(value);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const target = idx * ITEM_H;
    if (Math.abs(el.scrollTop - target) < 2) return;
    byCode.current = true;
    el.scrollTo({ top: target, behavior: "smooth" });
    setTimeout(() => { byCode.current = false; }, 300);
  }, [idx]);

  const handleScroll = useCallback(() => {
    if (byCode.current) return;
    const el = containerRef.current;
    if (!el) return;
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      const newIdx = Math.round(el.scrollTop / ITEM_H);
      const clamped = Math.max(0, Math.min(items.length - 1, newIdx));
      byCode.current = true;
      el.scrollTo({ top: clamped * ITEM_H, behavior: "smooth" });
      setTimeout(() => { byCode.current = false; }, 300);
      if (items[clamped] !== value) onChange(items[clamped]);
    }, 80);
  }, [items, value, onChange]);

  const clickItem = (item: T, i: number) => {
    onChange(item);
    const el = containerRef.current;
    if (!el) return;
    byCode.current = true;
    el.scrollTo({ top: i * ITEM_H, behavior: "smooth" });
    setTimeout(() => { byCode.current = false; }, 300);
  };

  return (
    <div className={`relative ${width} flex-shrink-0 overflow-hidden`}>
      <div
        className="pointer-events-none absolute inset-x-0 z-10 rounded-lg bg-primary/15 border border-primary/30"
        style={{ top: ITEM_H * 2, height: ITEM_H }}
      />
      <div className="pointer-events-none absolute top-0 inset-x-0 z-20 h-14 bg-gradient-to-b from-popover to-transparent" />
      <div className="pointer-events-none absolute bottom-0 inset-x-0 z-20 h-14 bg-gradient-to-t from-popover to-transparent" />
      <div
        ref={containerRef}
        style={{
          height: ITEM_H * VISIBLE,
          overflowY: "scroll",
          scrollSnapType: "y mandatory",
          scrollbarWidth: "none",
          msOverflowStyle: "none",
        }}
        onScroll={handleScroll}
      >
        <div style={{ height: ITEM_H * 2 }} />
        {items.map((item, i) => (
          <div
            key={i}
            onClick={() => clickItem(item, i)}
            className="flex items-center justify-center cursor-pointer select-none"
            style={{ height: ITEM_H, scrollSnapAlign: "center" }}
          >
            <span
              className={`text-sm font-bold transition-all duration-150 leading-tight text-center ${
                item === value
                  ? "text-primary text-[15px]"
                  : "text-muted-foreground opacity-60 scale-90"
              }`}
            >
              {label ? label(item) : String(item)}
            </span>
          </div>
        ))}
        <div style={{ height: ITEM_H * 2 }} />
      </div>
    </div>
  );
}

// ── DateTimePicker ─────────────────────────────────────────────────────────────

interface DateTimePickerProps {
  date: string;        // "YYYY-MM-DD"
  time: string;        // "HH:mm"
  onDateChange: (d: string) => void;
  onTimeChange: (t: string) => void;
  disablePast?: boolean;
}

function formatTrigger(date: string, time: string): string {
  const parts: string[] = [];
  if (date) {
    const d = parseISO(date);
    parts.push(isToday(d) ? "Today" : isTomorrow(d) ? "Tomorrow" : format(d, "EEE d MMM"));
  }
  if (time) {
    const { hour, minute, period } = parseTime(time);
    parts.push(`${hour}:${minute} ${period}`);
  }
  return parts.length ? parts.join(" · ") : "Pick date & time…";
}

export function DateTimePicker({ date, time, onDateChange, onTimeChange, disablePast = true }: DateTimePickerProps) {
  const [open, setOpen] = useState(false);
  const [calMonth, setCalMonth] = useState<Date>(() => date ? parseISO(date) : new Date());

  const parsed = parseTime(time);
  const [hour, setHour] = useState(parsed.hour);
  const [minute, setMinute] = useState(parsed.minute);
  const [period, setPeriod] = useState<"AM" | "PM">(parsed.period);

  useEffect(() => {
    if (open) {
      const p = parseTime(time);
      setHour(p.hour);
      setMinute(p.minute);
      setPeriod(p.period);
      if (date) setCalMonth(parseISO(date));
    }
  }, [open, time, date]);

  const commitTime = (h: number, m: string, p: "AM" | "PM") => {
    onTimeChange(to24h(h, m, p));
  };

  const selectedDate = date ? parseISO(date) : undefined;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          className="w-full h-12 justify-start text-left font-normal"
        >
          <CalendarClock size={15} className="mr-2 text-muted-foreground shrink-0" />
          <span className={date || time ? "text-foreground" : "text-muted-foreground"}>
            {formatTrigger(date, time)}
          </span>
        </Button>
      </PopoverTrigger>

      <PopoverContent
        className="w-auto p-0"
        align="start"
        sideOffset={6}
      >
        <div className="flex flex-col sm:flex-row">
          {/* ── Calendar ────────────────────────────────────────────── */}
          <div className="sm:border-r border-b sm:border-b-0 border-border">
            <DayPicker
              mode="single"
              selected={selectedDate}
              month={calMonth}
              onMonthChange={setCalMonth}
              onSelect={(d) => {
                if (!d) return;
                onDateChange(format(d, "yyyy-MM-dd"));
              }}
              disabled={disablePast ? (d) => {
                const today = new Date();
                today.setHours(0, 0, 0, 0);
                return d < today;
              } : undefined}
              classNames={{
                root: "p-3",
                months: "",
                month: "",
                caption: "flex justify-center items-center gap-2 mb-2",
                caption_label: "font-display font-bold text-sm",
                nav: "flex gap-1",
                nav_button: "h-7 w-7 rounded-md border border-border flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-accent transition-colors",
                nav_button_previous: "",
                nav_button_next: "",
                table: "w-full border-collapse",
                head_row: "flex",
                head_cell: "w-9 text-center text-[11px] text-muted-foreground font-medium",
                row: "flex mt-1",
                cell: "w-9 h-9 text-center text-sm p-0 relative",
                day: "w-9 h-9 rounded-full flex items-center justify-center text-sm font-medium hover:bg-accent transition-colors cursor-pointer",
                day_selected: "bg-primary text-primary-foreground hover:bg-primary",
                day_today: "font-bold text-primary",
                day_outside: "text-muted-foreground opacity-30",
                day_disabled: "text-muted-foreground opacity-20 cursor-not-allowed hover:bg-transparent",
                day_hidden: "invisible",
              }}
            />
          </div>

          {/* ── Time drums ──────────────────────────────────────────── */}
          <div className="flex flex-col justify-center p-4">
            <p className="text-[10px] uppercase text-muted-foreground tracking-widest mb-3 font-display text-center">
              Time
            </p>

            <div className="flex items-center gap-1">
              {/* Hour drum */}
              <DrumColumn
                items={HOURS}
                value={hour}
                width="w-12"
                onChange={(h) => { setHour(h); commitTime(h, minute, period); }}
              />

              <span className="text-xl font-bold text-foreground select-none pb-0.5">:</span>

              {/* Minute drum */}
              <DrumColumn
                items={MINUTES}
                value={minute}
                width="w-14"
                onChange={(m) => { setMinute(m); commitTime(hour, m, period); }}
              />

              {/* AM/PM drum */}
              <DrumColumn
                items={PERIODS}
                value={period}
                width="w-12"
                onChange={(p) => { setPeriod(p); commitTime(hour, minute, p); }}
              />
            </div>

            {/* Live preview */}
            <div className="mt-3 pt-3 border-t border-border text-center text-xs font-bold text-primary font-display tracking-wide">
              {date ? format(parseISO(date), "EEE d MMM") : "No date"} · {hour}:{minute} {period}
            </div>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
