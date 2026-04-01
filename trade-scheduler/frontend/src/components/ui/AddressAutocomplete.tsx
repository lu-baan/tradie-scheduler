import { useEffect, useRef, useState } from "react";
import { Input } from "@/components/ui/input";

declare global {
  interface Window {
    google: typeof google;
  }
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
  const autocompleteRef = useRef<google.maps.places.Autocomplete | null>(null);
  const [isLoaded, setIsLoaded] = useState(false);

  // Wait for Google Maps script to load
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    const check = () => {
      if (window.google?.maps?.places) {
        setIsLoaded(true);
        return;
      }
      // Retry until the async script finishes loading
      timer = setTimeout(check, 200);
    };
    check();
    return () => clearTimeout(timer);
  }, []);

  // Initialise autocomplete once the API and input are ready
  useEffect(() => {
    if (!isLoaded || !inputRef.current || autocompleteRef.current) return;

    const autocomplete = new window.google.maps.places.Autocomplete(inputRef.current, {
      componentRestrictions: { country: "au" },
      types: ["address"],
      // Request geometry to get latitude and longitude
      fields: ["formatted_address", "geometry"],
    });

    autocomplete.addListener("place_changed", () => {
      const place = autocomplete.getPlace();
      
      if (place?.formatted_address) {
        onChange(place.formatted_address);
        
        // Extract exact coordinates if the callback is provided
        if (onCoordinatesSelect && place.geometry?.location) {
          const lat = place.geometry.location.lat();
          const lng = place.geometry.location.lng();
          onCoordinatesSelect(lat, lng);
        }
      }
    });

    autocompleteRef.current = autocomplete;

    // Cleanup
    return () => {
      if (autocompleteRef.current) {
        window.google.maps.event.clearInstanceListeners(autocompleteRef.current);
        autocompleteRef.current = null;
      }
    };
  }, [isLoaded, onChange, onCoordinatesSelect]);

  // Keep the input's DOM value in sync when controlled value changes externally
  useEffect(() => {
    if (inputRef.current && inputRef.current.value !== value) {
      inputRef.current.value = value;
    }
  }, [value]);

  return (
    <Input
      ref={inputRef}
      name={name}
      onChange={(e) => onChange(e.target.value)}
      onBlur={onBlur}
      placeholder={placeholder}
      autoComplete="off"
    />
  );
}