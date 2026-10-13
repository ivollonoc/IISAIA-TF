import { redirect } from "next/navigation";

// El login vive en la página principal.
export default function LoginPage() {
  redirect("/");
}
