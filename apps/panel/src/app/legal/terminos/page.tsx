import type { Metadata } from "next";
import { LegalDraft } from "@/components/landing/legal-page";

export const metadata: Metadata = { title: "Términos (borrador)", robots: { index: false, follow: false } };

export default function TerminosPage() {
  return (
    <LegalDraft
      title="Términos de uso"
      updated="20 de octubre de 2026"
      sections={[
        { h: "1. Quiénes somos", p: ["Walt es un servicio de [entidad legal a constituir], con domicilio en Montevideo, Uruguay. Contacto: [mail a confirmar]."] },
        {
          h: "2. Qué es Walt",
          p: [
            "Walt recibe pedidos de cambios de los clientes de una agencia o un profesional independiente por mensajería, los interpreta con inteligencia artificial, aplica las reglas que la agencia configura y, según el tipo de pedido, publica el cambio con la confirmación del cliente, lo envía a la agencia para su aprobación o arma un presupuesto.",
          ],
        },
        {
          h: "3. Beta",
          p: [
            "Durante la beta privada el servicio es gratuito por 3 meses, no se pide tarjeta y puede tener cambios, interrupciones o errores. La agencia acepta probarlo con proyectos que pueda restaurar.",
          ],
        },
        {
          h: "4. Responsabilidades de la agencia",
          p: [
            "La agencia es responsable de los repositorios y proyectos que conecta, de las reglas que configura y de aprobar los cambios delicados. Debe contar con el permiso de sus clientes para que Walt procese sus pedidos.",
          ],
        },
        { h: "5. Inteligencia artificial", p: ["Walt usa modelos de terceros (Anthropic). Las respuestas pueden contener errores; por eso todo cambio pasa por una vista previa y lo delicado requiere aprobación."] },
        { h: "6. Precios y cobro", p: ["Los precios publicados son de lanzamiento y pueden cambiar. Hoy no se cobra nada; antes de cobrar se informará el precio y el medio de pago."] },
        { h: "7. Baja", p: ["La agencia puede dejar de usar Walt cuando quiera. El código queda en su repositorio."] },
        { h: "8. Ley aplicable", p: ["[A definir con el abogado: ley uruguaya y tribunales de Montevideo, y lo que corresponda para clientes de otros países]."] },
      ]}
    />
  );
}
