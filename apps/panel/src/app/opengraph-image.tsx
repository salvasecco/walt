import { ImageResponse } from "next/og";

// Imagen para compartir la landing en WhatsApp y LinkedIn (1200×630), con la identidad de build 101.
export const alt = "Walt: vos entregás, Walt atiende.";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", justifyContent: "space-between", background: "#0E1116", padding: 72, color: "#F3F5F7" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
          <svg width="76" height="76" viewBox="0 0 160 160">
            <rect width="160" height="160" rx="40" fill="#0B0D10" />
            <path d="M20 80h26.7l16.7-40 33.3 80 16.7-40h26.6" fill="none" stroke="#2BD97C" strokeWidth="16" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <span style={{ fontSize: 44, fontWeight: 700 }}>Walt</span>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
          <span style={{ fontSize: 92, fontWeight: 700, lineHeight: 1, letterSpacing: -3 }}>Vos entregás.</span>
          <span style={{ fontSize: 92, fontWeight: 700, lineHeight: 1, letterSpacing: -3, color: "#2BD97C" }}>Walt atiende.</span>
        </div>
        <span style={{ fontSize: 30, color: "#A7B0BD" }}>Tus clientes piden cambios por chat. Walt los muestra y los publica con un «Dale».</span>
      </div>
    ),
    size,
  );
}
