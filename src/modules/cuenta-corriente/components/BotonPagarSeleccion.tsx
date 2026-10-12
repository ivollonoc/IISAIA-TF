"use client";

// Botón del checkout que muestra el total de los cargos tildados en su <form>.
import { useEffect, useRef, useState } from "react";
import { Boton } from "@/components/ui";
import { formatPesos } from "@/lib/format";

export function BotonPagarSeleccion({ name }: { name: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const [total, setTotal] = useState(0);

  useEffect(() => {
    const form = ref.current?.closest("form");
    if (!form) return;
    const recalcular = () =>
      setTotal(
        [...form.querySelectorAll<HTMLInputElement>(`input[name="${name}"]:checked`)].reduce(
          (s, i) => s + Number(i.dataset.monto ?? 0),
          0,
        ),
      );
    recalcular();
    form.addEventListener("change", recalcular);
    return () => form.removeEventListener("change", recalcular);
  }, [name]);

  return (
    <span ref={ref}>
      <Boton type="submit" disabled={total === 0} className="disabled:opacity-40">
        {total > 0 ? `Pagar seleccionados (${formatPesos(total)})` : "Tildá los cargos a pagar"}
      </Boton>
    </span>
  );
}
