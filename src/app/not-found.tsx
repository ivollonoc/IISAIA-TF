import Link from "next/link";

export default function NotFound() {
  return (
    <div className="py-16 text-center">
      <h1 className="text-2xl font-bold">No encontrado</h1>
      <Link href="/" className="mt-4 inline-block text-emerald-700 underline">
        Volver al inicio
      </Link>
    </div>
  );
}
