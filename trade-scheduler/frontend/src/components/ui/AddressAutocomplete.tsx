import { useEffect, useRef, useState } from "react";
import { Input } from "@/components/ui/input";

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

type Mode = "waiting" | "new-api" | "legacy" | "plain";

export function AddressAutocomplete({
  value,
  onChange,
  onCoordinatesSelect,
  onBlur,
  placeholder = "Start typing an address…",
  name,
}: AddressAutocompleteProps) {
  const [mode, setMode] = useState<Mode>("waiting");
  const newContainerRef = useRef<HTMLDivElement>(null);
  const legacyInputRef = useRef<HTMLInputElement>(null);
  const cleanupRef = useRef<(() => void) | null>(null);

  // Step 1: wait for Maps JS to load, then pick the right API
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    let attempts = 0;

    const check = () => {
      if (window.google?.maps?.places) {
        const hasNew = !!(window.google.maps.places as any).PlaceAutocompleteElement;
        setMode(hasNew ? "new-api" : "legacy");
        return;
      }
      attempts++;
      if (attempts > 30) {
        // Maps never loaded — use plain text input
        setMode("plain");
        return;
      }
      timer = setTimeout(check, 300);
    };
    check();
    return () => clearTimeout(timer);
  }, []);

  // Step 2a: mount the new PlaceAutocompleteElement into its container div
  useEffect(() => {
    if (mode !== "new-api" || !newContainerRef.current) return;
    if (cleanupRef.current) return; // already mounted

    try {
      const PlaceAuto = (window.google.maps.places as any).PlaceAutocompleteElement;
      const el: HTMLElement = new PlaceAuto({
        componentRestrictions: { country: "au" },
        types: ["address"],
      });
      el.style.width = "100%";
      newContainerRef.current.appendChild(el);

      const handler = (e: any) => {
        const prediction = e.placePrediction;
        if (!prediction) return;
        const place = prediction.toPlace();
        place.fetchFields({ fields: ["formattedAddress", "location"] }).then(() => {
          const addr: string = place.formattedAddress ?? "";
          onChange(addr);
          if (onCoordinatesSelect && place.location) {
            onCoordinatesSelect(place.location.lat(), place.location.lng());
          }
        });
      };

      el.addEventListener("gmp-placeselect", handler);

      cleanupRef.current = () => {
        el.removeEventListener("gmp-placeselect", handler);
        el.remove();
        cleanupRef.current = null;
      };
    } catch {
      // New API init failed — fall back to legacy
      setMode("legacy");
    }

    return () => { cleanupRef.current?.(); };
  }, [mode, onChange, onCoordinatesSelect]);

  // Step 2b: attach legacy Autocomplete to the plain input
  useEffect(() => {
    if (mode !== "legacy" || !legacyInputRef.current) return;
    if (cleanupRef.current) return;

    try {
      const ac = new window.google.maps.places.Autocomplete(legacyInputRef.current, {
        componentRestrictions: { country: "au" },
        types: ["address"],
        fields: ["formatted_address", "geometry"],
      });

      const handler = () => {
        const place = ac.getPlace();
        if (place?.formatted_address) {
          onChange(place.formatted_address);
          if (onCoordinatesSelect && place.geometry?.location) {
            onCoordinatesSelect(
              place.geometry.location.lat(),
              place.geometry.location.lng(),
            );
          }
        }
      };

      ac.addListener("place_changed", handler);

      cleanupRef.current = () => {
        window.google.maps.event.clearInstanceListeners(ac);
        cleanupRef.current = null;
      };
    } catch {
      setMode("plain");
    }

    return () => { cleanupRef.current?.(); };
  }, [mode, onChange, onCoordinatesSelect]);

  // Sync controlled value into the legacy/plain input
  useEffect(() => {
    if (legacyInputRef.current && legacyInputRef.current.value !== value) {
      legacyInputRef.current.value = value;
    }
  }, [value]);

  if (mode === "new-api") {
    // PlaceAutocompleteElement renders its own input inside this div
    return <div ref={newContainerRef} className="w-full" />;
  }

  // Legacy Autocomplete and plain text share the same Input element
  return (
    <Input
      ref={legacyInputRef}
      name={name}
      defaultValue={value}
      onChange={(e) => onChange(e.target.value)}
      onBlur={onBlur}
      placeholder={placeholder}
      autoComplete="off"
    />
  );
}
