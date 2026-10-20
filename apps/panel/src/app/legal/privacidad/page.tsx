import type { Metadata } from "next";
import { LegalDraft } from "@/components/landing/legal-page";

export const metadata: Metadata = { title: "Privacidad (borrador)", robots: { index: false, follow: false } };

export default function PrivacidadPage() {
  return (
    <LegalDraft
      title="Política de privacidad"
      updated="20 de octubre de 2026"
      sections={[
        { h: "1. Responsable", p: ["[Entidad legal a constituir], Montevideo, Uruguay. Contacto para datos personales: [mail a confirmar]."] },
        {
          h: "2. Qué datos tratamos",
          p: [
            "De la agencia: nombre, mail y datos de la cuenta. De sus clientes: los mensajes y audios que mandan por el canal, su nombre visible y su identificador en ese canal, y los cambios que piden.",
            "En la página pública solo medimos eventos sin datos personales: qué botón se tocó, el plan elegido y el tramo de resultado de la calculadora. No guardamos IP ni mail en esa medición.",
          ],
        },
        { h: "3. Para qué", p: ["Para prestar el servicio: interpretar los pedidos, mostrar vistas previas, publicar cambios, armar presupuestos y medir la calidad de la clasificación."] },
        {
          h: "4. Con quién",
          p: ["Con los proveedores que hacen posible el servicio: alojamiento y base de datos (Vercel, Supabase), modelos de IA (Anthropic), mensajería (Telegram) y GitHub. [Completar la lista y sus países]."],
        },
        { h: "5. Aislamiento", p: ["Cada agencia ve solo sus datos. Los datos de una agencia no se usan para atender a otra."] },
        {
          h: "6. Derechos",
          p: ["Podés pedir acceso, rectificación o eliminación de tus datos escribiendo a [mail a confirmar]. [Completar según la Ley 18.331 de Uruguay y, si corresponde, la LGPD de Brasil y el GDPR]."],
        },
        { h: "7. Retención", p: ["[A definir: plazo de retención de mensajes y pedidos, y borrado a pedido]."] },
      ]}
    />
  );
}
