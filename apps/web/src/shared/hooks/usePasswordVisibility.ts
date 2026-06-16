import { useState } from "react";

export function usePasswordVisibility() {
  const [visible, setVisible] = useState(false);
  const toggle = () => setVisible((v) => !v);
  return { visible, toggle };
}
