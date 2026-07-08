import { useRef, useEffect, KeyboardEvent, ClipboardEvent, FocusEvent } from "react";

interface OTPInputProps {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  idPrefix?: string;
  autoFocus?: boolean;
}

export default function OTPInput({
  value,
  onChange,
  disabled = false,
  idPrefix = "otp",
  autoFocus = true,
}: OTPInputProps) {
  const inputsRef = useRef<(HTMLInputElement | null)[]>([]);

  // Construct an array of 6 elements representing the digits
  const digits = value.split("").concat(Array(6).fill("")).slice(0, 6);

  // Focus the first empty field or the first field on mount if autoFocus is true
  useEffect(() => {
    if (autoFocus && !disabled) {
      // Find the first empty input or default to the first input
      const firstEmptyIndex = digits.findIndex((d) => d === "");
      const focusIndex = firstEmptyIndex === -1 ? 0 : firstEmptyIndex;
      inputsRef.current[focusIndex]?.focus();
    }
  }, [autoFocus, disabled]);

  const updateDigit = (index: number, val: string) => {
    const newDigits = [...digits];
    newDigits[index] = val;
    const newValue = newDigits.join("");
    onChange(newValue);
  };

  const handleKeyDown = (index: number, e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Backspace") {
      if (!digits[index] && index > 0) {
        // Current is empty: clear previous box and focus it
        updateDigit(index - 1, "");
        inputsRef.current[index - 1]?.focus();
      } else {
        // Current has value: clear it
        updateDigit(index, "");
      }
      e.preventDefault();
    } else if (e.key === "ArrowLeft") {
      if (index > 0) {
        inputsRef.current[index - 1]?.focus();
        e.preventDefault();
      }
    } else if (e.key === "ArrowRight") {
      if (index < 5) {
        inputsRef.current[index + 1]?.focus();
        e.preventDefault();
      }
    }
  };

  const handleInput = (index: number, val: string) => {
    // Keep only numeric characters
    const cleanVal = val.replace(/[^0-9]/g, "");
    if (!cleanVal) {
      // If backspace or non-digit was entered resulting in empty, just clear it
      updateDigit(index, "");
      return;
    }

    // Use the last typed character in case multiple digits exist
    const singleDigit = cleanVal.slice(-1);
    updateDigit(index, singleDigit);

    // Auto-focus next input box if available
    if (index < 5) {
      inputsRef.current[index + 1]?.focus();
    }
  };

  const handlePaste = (e: ClipboardEvent<HTMLInputElement>) => {
    e.preventDefault();
    if (disabled) return;

    const pastedData = e.clipboardData.getData("text");
    const cleanDigits = pastedData.replace(/[^0-9]/g, "").slice(0, 6);
    
    // Notify parent of the new pasted value
    onChange(cleanDigits);

    // Focus the box after the pasted digits, or the last box if fully populated
    const focusIndex = Math.min(cleanDigits.length, 5);
    inputsRef.current[focusIndex]?.focus();
  };

  const handleFocus = (e: FocusEvent<HTMLInputElement>) => {
    // Highlight existing text for easy overwrite
    e.target.select();
  };

  return (
    <div className="otp-container" role="group" aria-label="6-digit verification code">
      {Array(6)
        .fill(null)
        .map((_, index) => (
          <input
            key={index}
            id={`${idPrefix}-${index}`}
            ref={(el) => {
              inputsRef.current[index] = el;
            }}
            type="text"
            inputMode="numeric"
            pattern="[0-9]*"
            maxLength={1}
            value={digits[index]}
            onChange={(e) => handleInput(index, e.target.value)}
            onKeyDown={(e) => handleKeyDown(index, e)}
            onPaste={handlePaste}
            onFocus={handleFocus}
            disabled={disabled}
            autoComplete={index === 0 ? "one-time-code" : "off"}
            aria-label={`Digit ${index + 1} of 6`}
            className="otp-box"
            required
          />
        ))}
    </div>
  );
}
