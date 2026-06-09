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

type SuggestionItem =
  | { kind: "new"; raw: any }
  | { kind: "legacy"; prediction: any };

export function AddressAutocomplete({
  value,
  onChange,
  onCoordinatesSelect,
  onBlur,
  placeholder = "Start typing an address…",
  name,
}: AddressAutocompleteProps) {
  const [suggestions, setSuggestions] = useState<SuggestionItem[]>([]);
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onChangeRef = useRef(onChange);
  const onCoordsRef = useRef(onCoordinatesSelect);

  useEffect(() => { onChangeRef.current = onChange; }, [onChange]);
  useEffect(() => { onCoordsRef.current = onCoordinatesSelect; }, [onCoordinatesSelect]);

  const fetchSuggestions = useCallback(async (input: string) => {
    if (!input || input.length < 3) {
      setSuggestions([]);
      setOpen(false);
      return;
    }

    // ── Try new Places API (AutocompleteSuggestion) ────────────────────────
    if (window.google?.maps?.places?.AutocompleteSuggestion) {
      try {
        const { suggestions: sugg } =
          await window.google.maps.places.AutocompleteSuggestion.fetchAutocompleteSuggestions({
            input,
            componentRestrictions: { country: "au" },
            types: ["address"],
          });
        if (sugg?.length) {
          setSuggestions(sugg.map((s: any) => ({ kind: "new" as const, raw: s })));
          setOpen(true);
          return;
        }
      } catch {
        // fall through to legacy
      }
    }

    // ── Fall back to legacy AutocompleteService ────────────────────────────
    if (window.google?.maps?.places?.AutocompleteService) {
      const svc = new window.google.maps.places.AutocompleteService();
      svc.getPlacePredictions(
        { input, componentRestrictions: { country: "au" }, types: ["address"] },
        (predictions: any[], status: string) => {
          if (status === "OK" && predictions?.length) {
            setSuggestions(predictions.map(p => ({ kind: "legacy" as const, prediction: p })));
            setOpen(true);
          } else {
            setSuggestions([]);
            setOpen(false);
          }
        }
      );
    }
  }, []);

  const handleChange = (val: string) => {
    onChangeRef.current(val);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => fetchSuggestions(val), 250);
  };

  const handleSelect = async (item: SuggestionItem) => {
    setOpen(false);
    setSuggestions([]);

    if (item.kind === "new") {
      try {
        const place = item.raw.placePrediction.toPlace();
        await place.fetchFields({ fields: ["formattedAddress", "location"] });
        const addr = place.formattedAddress ?? item.raw.placePrediction.text?.toString() ?? "";
        onChangeRef.current(addr);
        if (place.location) {
          onCoordsRef.current?.(place.location.lat(), place.location.lng());
        }
      } catch {
        const text = item.raw.placePrediction?.text?.toString() ?? "";
        if (text) onChangeRef.current(text);
      }
      return;
    }

    // Legacy: use PlacesService to get coordinates
    onChangeRef.current(item.prediction.description);
    if (window.google?.maps?.places?.PlacesService && item.prediction.place_id) {
      try {
        const dummy = document.createElement("div");
        const svc = new window.google.maps.places.PlacesService(dummy);
        svc.getDetails(
          { placeId: item.prediction.place_id, fields: ["formatted_address", "geometry"] },
          (place: any, status: string) => {
            if (status === "OK" && place) {
              if (place.formatted_address) onChangeRef.current(place.formatted_address);
              if (place.geometry?.location) {
                onCoordsRef.current?.(
                  place.geometry.location.lat(),
                  place.geometry.location.lng()
                );
              }
            }
          }
        );
      } catch {
        // address already set from description above
      }
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

  const getDisplayText = (item: SuggestionItem) => {
    if (item.kind === "new") {
      return {
        main: item.raw.placePrediction?.mainText?.toString() ?? item.raw.placePrediction?.text?.toString() ?? "",
        secondary: item.raw.placePrediction?.secondaryText?.toString() ?? "",
      };
    }
    return {
      main: item.prediction.structured_formatting?.main_text ?? item.prediction.description,
      secondary: item.prediction.structured_formatting?.secondary_text ?? "",
    };
  };

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
          {suggestions.map((item, i) => {
            const { main, secondary } = getDisplayText(item);
            return (
              <button
                key={i}
                type="button"
                className="w-full text-left px-3 py-2.5 text-sm hover:bg-muted transition-colors border-b border-border/40 last:border-0 flex items-start gap-2"
                onMouseDown={(e) => { e.preventDefault(); handleSelect(item); }}
              >
                <MapPin size={13} className="text-primary shrink-0 mt-0.5" />
                <div className="min-w-0">
                  <div className="font-medium truncate text-foreground">{main}</div>
                  {secondary && (
                    <div className="text-xs text-muted-foreground truncate mt-0.5">{secondary}</div>
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
