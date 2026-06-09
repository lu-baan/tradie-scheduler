import { useEffect, useRef, useState, useCallback } from "react";
import { Input } from "@/components/ui/input";
import { MapPin } from "lucide-react";

declare global {
  interface Window { google: any; }
}

interface AddressAutocompleteProps {
  value: string;
  onChange: (value: string) => void;
  onCoordinatesSelect?: (lat: number, lng: number) => void;
  onBlur?: () => void;
  placeholder?: string;
  name?: string;
}

export function AddressAutocomplete({
  value,
  onChange,
  onCoordinatesSelect,
  onBlur,
  placeholder = "Start typing an address…",
  name,
}: AddressAutocompleteProps) {
  const [suggestions, setSuggestions] = useState<any[]>([]);
  const [open, setOpen] = useState(false);
  const [mapsReady, setMapsReady] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onChangeRef = useRef(onChange);
  const onCoordsRef = useRef(onCoordinatesSelect);

  useEffect(() => { onChangeRef.current = onChange; }, [onChange]);
  useEffect(() => { onCoordsRef.current = onCoordinatesSelect; }, [onCoordinatesSelect]);

  // Wait for the new Places API to load
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    let attempts = 0;
    const check = () => {
      if (window.google?.maps?.places?.AutocompleteSuggestion) {
        setMapsReady(true);
        return;
      }
      if (++attempts > 40) return;
      timer = setTimeout(check, 300);
    };
    check();
    return () => clearTimeout(timer);
  }, []);

  const fetchSuggestions = useCallback(async (input: string) => {
    if (!input || input.length < 3 || !mapsReady) {
      setSuggestions([]);
      setOpen(false);
      return;
    }
    try {
      const { suggestions: sugg } =
        await window.google.maps.places.AutocompleteSuggestion.fetchAutocompleteSuggestions({
          input,
          componentRestrictions: { country: "au" },
          types: ["address"],
        });
      setSuggestions(sugg ?? []);
      setOpen((sugg ?? []).length > 0);
    } catch {
      setSuggestions([]);
      setOpen(false);
    }
  }, [mapsReady]);

  const handleChange = (val: string) => {
    onChangeRef.current(val);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => fetchSuggestions(val), 250);
  };

  const handleSelect = async (suggestion: any) => {
    setOpen(false);
    setSuggestions([]);
    try {
      const place = suggestion.placePrediction.toPlace();
      await place.fetchFields({ fields: ["formattedAddress", "location"] });
      const addr = place.formattedAddress ?? suggestion.placePrediction.text?.toString() ?? "";
      onChangeRef.current(addr);
      if (place.location) {
        onCoordsRef.current?.(place.location.lat(), place.location.lng());
      }
    } catch {
      const text = suggestion.placePrediction?.text?.toString() ?? "";
      if (text) onChangeRef.current(text);
    }
  };

  // Close dropdown on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  return (
    <div ref={containerRef} className="relative">
      <Input
        name={name}
        value={value}
        onChange={(e) => handleChange(e.target.value)}
        onBlur={onBlur}
        placeholder={placeholder}
        autoComplete="off"
      />

      {open && suggestions.length > 0 && (
        <div className="absolute z-[9999] w-full mt-1 bg-popover border border-border rounded-lg shadow-xl overflow-hidden">
          {suggestions.map((s: any, i: number) => {
            const mainText = s.placePrediction?.mainText?.toString() ?? "";
            const secondaryText = s.placePrediction?.secondaryText?.toString() ?? "";
            const fullText = s.placePrediction?.text?.toString() ?? mainText;
            return (
              <button
                key={i}
                type="button"
                className="w-full text-left px-3 py-2.5 text-sm hover:bg-muted transition-colors border-b border-border/40 last:border-0 flex items-start gap-2"
                onMouseDown={(e) => { e.preventDefault(); handleSelect(s); }}
              >
                <MapPin size={13} className="text-primary shrink-0 mt-0.5" />
                <div className="min-w-0">
                  <div className="font-medium truncate text-foreground">{mainText || fullText}</div>
                  {secondaryText && (
                    <div className="text-xs text-muted-foreground truncate mt-0.5">{secondaryText}</div>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
