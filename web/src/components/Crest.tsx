import { getCrestUrl, monogram } from "@/lib/crests";

export function Crest({
  team,
  size = 40,
  className = "team-crest",
}: {
  team?: string;
  size?: number;
  className?: string;
}) {
  const url = getCrestUrl(team);
  if (!url) {
    return (
      <span className={`${className} crest-fallback`} aria-hidden="true">
        {monogram(team)}
      </span>
    );
  }
  // Plain <img> (not next/image): crests are tiny and external; avoids the
  // optimizer round-trip and keeps parity with the vanilla frontend.
  // eslint-disable-next-line @next/next/no-img-element
  return (
    <img
      src={url}
      alt={team || ""}
      className={className}
      width={size}
      height={size}
      loading="lazy"
      decoding="async"
    />
  );
}
