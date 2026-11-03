import { useEffect, useState, type ReactNode } from "react";
export function Screen({
  visible,
  children,
}: {
  visible: boolean;
  children: ReactNode;
}) {
  const [visited, setVisited] = useState(visible);
  useEffect(() => {
    if (visible) setVisited(true);
  }, [visible]);
  if (!visible && !visited) return null;
  return <div hidden={!visible}>{children}</div>;
}
