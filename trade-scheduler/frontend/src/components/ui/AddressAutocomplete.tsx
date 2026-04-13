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

export function AddressAutocomplete({
  value,
  onChange,
  onCoordinatesSelect,
  onBlur,
  placeholder = "Start typing an address…",
  name,
}: AddressAutocompleteProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const acRef = useRef<any>(null);
  const [ready, setReady] = useState(false);

  // Wait for Maps JS to load
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    let attempts = 0;

    const check = () => {
      if (window.google?.maps?.places?.Autocomplete) {
        setReady(true);
        return;
      }
      if (++attempts > 30) {
        // Maps never loaded — plain input is already rendered, nothing more to do
        return;
      }
      timer = setTimeout(check, 300);
    };
    check();
    return () => clearTimeout(timer);
  }, []);

  // Attach legacy Autocomplete once Maps is ready
  useEffect(() => {
    if (!ready || !inputRef.current || acRef.current) return;

    try {
      const ac = new window.google.maps.places.Autocomplete(inputRef.current, {
        componentRestrictions: { country: "au" },
        types: ["address"],
        fields: ["formatted_address", "geometry"],
      });
      acRef.current = ac;

      ac.addListener("place_changed", () => {
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
      });
    } catch {
      // Maps failed — plain input still works
    }

    return () => {
      if (acRef.current) {
        window.google?.maps?.event?.clearInstanceListeners(acRef.current);
        acRef.current = null;
      }
    };
  }, [ready, onChange, onCoordinatesSelect]);

  // Sync controlled value into the input
  useEffect(() => {
    if (inputRef.current && inputRef.current.value !== value) {
      inputRef.current.value = value;
    }
  }, [value]);

  return (
    <Input
      ref={inputRef}
      name={name}
      defaultValue={value}
      onChange={(e) => onChange(e.target.value)}
      onBlur={onBlur}
      placeholder={placeholder}
      autoComplete="off"
    />
  );
}
