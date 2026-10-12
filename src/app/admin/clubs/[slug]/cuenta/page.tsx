import Link from "next/link";
import { notFound } from "next/navigation";
import { requireSuperadmin } from "@/lib/session";
import { obtenerClubPorSlug } from "@/modules/clubs/service";
import { cuentaClub } from "@/modules/cuenta-corriente/consultas.service";
import { Titulo } from "@/components/ui";
import { CuentaClub } from "@/modules/cuenta-corriente/components/CuentaClub";

/** Cuenta del club en solo lectura para el admin general (la plataforma solo observa). */
export default async function CuentaClubAdminGeneralPage({ params }: { params: Promise<{ slug: string }> }) {
  await requireSuperadmin();
  const { slug } = await params;
  const club = await obtenerClubPorSlug(slug);
  if (!club) notFound();
  const cuenta = await cuentaClub(club.id);

  return (
    <>
      <Link href="/admin" className="mb-2 inline-block text-sm text-emerald-700 underline">
        ← Admin general
      </Link>
      <Titulo sub="Cuenta corriente · solo lectura">{club.nombre}</Titulo>
      <CuentaClub cuenta={cuenta} />
    </>
  );
}
